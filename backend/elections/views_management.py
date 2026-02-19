from __future__ import annotations

import base64
import csv
import json
import logging
import secrets
from datetime import timedelta
from io import BytesIO
from io import StringIO

from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.db import transaction
from django.db.models import Q
from django.db.models import Count
from django.db.models.functions import TruncMinute
from django.http import HttpResponse
from django.http import StreamingHttpResponse
from django.template.loader import render_to_string
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder
from openpyxl import Workbook
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academic.models import AcademicYear
from audit.services import log_event
from audit.models import AuditLog
from students.models import Enrollment

from .models import (
    CandidatoContraloria,
    CandidatoPersoneria,
    ElectionCandidate,
    ElectionCensusMember,
    ElectionCensusSync,
    ElectionOpeningRecord,
    ElectionProcess,
    ElectionProcessCensusExclusion,
    ElectionRole,
    VoteRecord,
    VoterToken,
)
from .permissions import CanManageElectionSetup
from .serializers import (
    CandidatoContraloriaCreateSerializer,
    CandidatoPersoneriaCreateSerializer,
    ElectionCandidateManageSerializer,
    ElectionProcessCreateSerializer,
    ElectionProcessUpdateSerializer,
    ElectionProcessManageSerializer,
    ElectionOpeningRecordSerializer,
    ElectionRoleCreateSerializer,
    ElectionRoleManageSerializer,
    ElectionTokenEligibilityIssueSerializer,
    get_voter_token_census_eligibility_error,
)
from .services_observer import generate_observer_congratulations_for_election

try:
    import qrcode  # type: ignore
except Exception:
    qrcode = None


LIVE_DASHBOARD_CACHE_TTL_SECONDS = 10
logger = logging.getLogger(__name__)


def _parse_live_dashboard_params(request) -> tuple[dict | None, Response | None]:
    try:
        window_minutes = int(request.query_params.get("window_minutes", 60))
    except (TypeError, ValueError):
        return None, Response({"detail": "El parámetro window_minutes no es válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        blank_rate_threshold = float(request.query_params.get("blank_rate_threshold", 0.25))
    except (TypeError, ValueError):
        return None, Response({"detail": "El parámetro blank_rate_threshold no es válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        inactivity_minutes = int(request.query_params.get("inactivity_minutes", 10))
    except (TypeError, ValueError):
        return None, Response({"detail": "El parámetro inactivity_minutes no es válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        spike_threshold = int(request.query_params.get("spike_threshold", 8))
    except (TypeError, ValueError):
        return None, Response({"detail": "El parámetro spike_threshold no es válido."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        series_limit = int(request.query_params.get("series_limit", 60))
    except (TypeError, ValueError):
        return None, Response({"detail": "El parámetro series_limit no es válido."}, status=status.HTTP_400_BAD_REQUEST)

    since_raw = request.query_params.get("since")
    since: timezone.datetime | None = None
    if since_raw:
        parsed_since = parse_datetime(since_raw)
        if parsed_since is None:
            return None, Response({"detail": "El parámetro since no es válido."}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(parsed_since):
            parsed_since = timezone.make_aware(parsed_since, timezone.get_current_timezone())
        since = parsed_since

    include_ranking_raw = str(request.query_params.get("include_ranking", "true")).strip().lower()
    include_ranking = include_ranking_raw not in {"0", "false", "no"}

    if blank_rate_threshold < 0 or blank_rate_threshold > 1:
        return None, Response({"detail": "blank_rate_threshold debe estar entre 0 y 1."}, status=status.HTTP_400_BAD_REQUEST)

    if inactivity_minutes < 1 or inactivity_minutes > 120:
        return None, Response({"detail": "inactivity_minutes debe estar entre 1 y 120."}, status=status.HTTP_400_BAD_REQUEST)

    if spike_threshold < 1 or spike_threshold > 500:
        return None, Response({"detail": "spike_threshold debe estar entre 1 y 500."}, status=status.HTTP_400_BAD_REQUEST)

    if series_limit < 5 or series_limit > 180:
        return None, Response({"detail": "series_limit debe estar entre 5 y 180."}, status=status.HTTP_400_BAD_REQUEST)

    return {
        "window_minutes": window_minutes,
        "blank_rate_threshold": blank_rate_threshold,
        "inactivity_minutes": inactivity_minutes,
        "spike_threshold": spike_threshold,
        "series_limit": series_limit,
        "since": since,
        "include_ranking": include_ranking,
    }, None


def _build_live_dashboard_payload_cached(process: ElectionProcess, params: dict) -> dict:
    cache_key = (
        "elections:live-dashboard:"
        f"{process.id}:{params['window_minutes']}:{params['blank_rate_threshold']}:{params['inactivity_minutes']}:{params['spike_threshold']}:{params['series_limit']}:"
        f"{params['since'].isoformat() if params['since'] is not None else 'none'}:{1 if params['include_ranking'] else 0}"
    )
    cached_payload = cache.get(cache_key)
    if cached_payload is not None:
        return cached_payload

    payload = build_live_dashboard_payload(
        process,
        window_minutes=params["window_minutes"],
        blank_rate_threshold=params["blank_rate_threshold"],
        inactivity_minutes=params["inactivity_minutes"],
        spike_threshold=params["spike_threshold"],
        series_limit=params["series_limit"],
        since=params["since"],
        include_ranking=params["include_ranking"],
    )
    cache.set(cache_key, payload, LIVE_DASHBOARD_CACHE_TTL_SECONDS)
    return payload


def _grade_value_for_enrollment(enrollment: Enrollment) -> int | None:
    if enrollment.grade.ordinal is not None:
        return enrollment.grade.ordinal

    raw_name = (enrollment.grade.name or "").strip().lower().replace("°", "")
    compact = raw_name.replace(" ", "")
    if compact.isdigit():
        return int(compact)

    mapping = {
        "primero": 1,
        "segundo": 2,
        "tercero": 3,
        "cuarto": 4,
        "quinto": 5,
        "sexto": 6,
        "septimo": 7,
        "octavo": 8,
        "noveno": 9,
        "decimo": 10,
        "once": 11,
        "undecimo": 11,
        "decimoprimero": 11,
    }
    return mapping.get(compact)


def _grade_value_from_text(raw_grade: str | None) -> int | None:
    value = (raw_grade or "").strip().lower().replace("°", "")
    compact = value.replace(" ", "")
    mapping = {
        "primero": 1,
        "segundo": 2,
        "tercero": 3,
        "cuarto": 4,
        "quinto": 5,
        "sexto": 6,
        "septimo": 7,
        "octavo": 8,
        "noveno": 9,
        "decimo": 10,
        "once": 11,
        "undecimo": 11,
        "decimoprimero": 11,
    }
    if compact.isdigit():
        return int(compact)
    return mapping.get(compact)


def _normalize_scope_value(value: str | None) -> str:
    return (value or "").strip().lower()


def _is_grade_in_census_scope(raw_grade: str | None) -> bool:
    parsed = _grade_value_from_text(raw_grade)
    return parsed is not None and 1 <= parsed <= 11


def _group_sort_value(group_name: str) -> tuple[int, str]:
    raw = (group_name or "").strip()
    if not raw:
        return (-1, "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return (int(digits), raw.upper())
    return (0, raw.upper())


def _qr_png_data_uri(text: str) -> str:
    if not qrcode:
        return ""
    image = qrcode.make(text)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_scrutiny_summary_payload(process: ElectionProcess) -> dict:
    roles = list(ElectionRole.objects.filter(process=process).order_by("display_order", "id"))
    role_summaries: list[dict] = []

    total_votes = 0
    total_blank_votes = 0

    for role in roles:
        candidate_rows = list(
            VoteRecord.objects.filter(process=process, role=role, candidate__isnull=False)
            .values("candidate_id", "candidate__name", "candidate__number")
            .annotate(votes=Count("id"))
            .order_by("-votes", "candidate__number", "candidate_id")
        )
        blank_votes = VoteRecord.objects.filter(process=process, role=role, is_blank=True).count()
        role_total_votes = sum(row["votes"] for row in candidate_rows) + blank_votes

        total_votes += role_total_votes
        total_blank_votes += blank_votes

        role_summaries.append(
            {
                "role_id": role.id,
                "code": role.code,
                "title": role.title,
                "total_votes": role_total_votes,
                "blank_votes": blank_votes,
                "candidates": [
                    {
                        "candidate_id": row["candidate_id"],
                        "name": row["candidate__name"],
                        "number": row["candidate__number"],
                        "votes": row["votes"],
                    }
                    for row in candidate_rows
                ],
            }
        )

    return {
        "process": {
            "id": process.id,
            "name": process.name,
            "status": process.status,
        },
        "summary": {
            "total_votes": total_votes,
            "total_blank_votes": total_blank_votes,
            "generated_at": timezone.now(),
        },
        "roles": role_summaries,
    }


def _resolve_enabled_census_count(process: ElectionProcess) -> int:
    active_members = ElectionCensusMember.objects.filter(
        is_active=True,
        status=ElectionCensusMember.Status.ACTIVE,
    )
    total_active = active_members.count()
    if total_active == 0:
        return 0

    excluded_count = ElectionProcessCensusExclusion.objects.filter(
        process=process,
        census_member__is_active=True,
        census_member__status=ElectionCensusMember.Status.ACTIVE,
    ).count()
    return max(total_active - excluded_count, 0)


def build_live_dashboard_payload(
    process: ElectionProcess,
    *,
    window_minutes: int = 60,
    blank_rate_threshold: float = 0.25,
    inactivity_minutes: int = 10,
    spike_threshold: int = 8,
    series_limit: int = 60,
    since: timezone.datetime | None = None,
    include_ranking: bool = True,
) -> dict:
    summary = build_scrutiny_summary_payload(process)
    total_votes = int(summary["summary"]["total_votes"])
    total_blank_votes = int(summary["summary"]["total_blank_votes"])

    enabled_census_count = _resolve_enabled_census_count(process)
    unique_voters_count = VoteRecord.objects.filter(process=process).values("voter_token_id").distinct().count()
    participation_percent = 0.0
    if enabled_census_count > 0:
        participation_percent = round((unique_voters_count / enabled_census_count) * 100, 2)

    blank_vote_percent = 0.0
    if total_votes > 0:
        blank_vote_percent = round((total_blank_votes / total_votes) * 100, 2)

    bounded_window_minutes = min(max(window_minutes, 15), 240)
    now = timezone.now()
    series_since = now - timedelta(minutes=bounded_window_minutes)
    effective_since = series_since
    if since is not None and since > effective_since:
        effective_since = since

    minute_rows = list(
        VoteRecord.objects.filter(process=process, created_at__gte=effective_since)
        .annotate(minute=TruncMinute("created_at"))
        .values("minute")
        .annotate(
            total_votes=Count("id"),
            blank_votes=Count("id", filter=Q(is_blank=True)),
        )
        .order_by("minute")
    )
    bounded_series_limit = min(max(series_limit, 5), 180)
    if len(minute_rows) > bounded_series_limit:
        minute_rows = minute_rows[-bounded_series_limit:]

    minute_series = [
        {
            "minute": row["minute"].isoformat() if row["minute"] else None,
            "total_votes": row["total_votes"],
            "blank_votes": row["blank_votes"],
        }
        for row in minute_rows
    ]

    alerts: list[dict] = []

    if process.status == ElectionProcess.Status.OPEN:
        has_recent_votes = VoteRecord.objects.filter(
            process=process,
            created_at__gte=now - timedelta(minutes=inactivity_minutes),
        ).exists()
        if not has_recent_votes:
            alerts.append(
                {
                    "code": "INACTIVITY",
                    "severity": "warning",
                    "title": "Inactividad reciente",
                    "detail": f"No se registran votos en los últimos {inactivity_minutes} minutos.",
                }
            )

    blank_rate_value = (total_blank_votes / total_votes) if total_votes > 0 else 0
    if total_votes >= 10 and blank_rate_value >= blank_rate_threshold:
        alerts.append(
            {
                "code": "HIGH_BLANK_RATE",
                "severity": "warning",
                "title": "Voto en blanco elevado",
                "detail": f"El voto en blanco alcanza {blank_vote_percent}% sobre {total_votes} votos.",
            }
        )

    latest_minute_votes = minute_rows[-1]["total_votes"] if minute_rows else 0
    if latest_minute_votes >= spike_threshold:
        alerts.append(
            {
                "code": "VOTE_SPIKE",
                "severity": "info",
                "title": "Pico de votación",
                "detail": f"Se registraron {latest_minute_votes} votos en el último minuto consolidado.",
            }
        )

    audit_since = now - timedelta(hours=24)
    process_audit_qs = AuditLog.objects.filter(
        created_at__gte=audit_since,
        event_type__startswith="ELECTION_",
        object_type="ElectionProcess",
        object_id=str(process.id),
    )
    audited_events_24h = process_audit_qs.count()
    client_errors_24h = process_audit_qs.filter(status_code__gte=400, status_code__lt=500).count()
    server_errors_24h = process_audit_qs.filter(status_code__gte=500).count()
    duplicate_submits_24h = process_audit_qs.filter(event_type="ELECTION_VOTE_SUBMIT_DUPLICATE").count()
    vote_submits_24h = process_audit_qs.filter(event_type="ELECTION_VOTE_SUBMIT").count()
    manual_regenerations_24h = process_audit_qs.filter(
        event_type__in=["ELECTION_CENSUS_MANUAL_CODES_EXPORT", "ELECTION_CENSUS_QR_PRINT"],
        metadata__mode="regenerate",
    ).count()

    failed_events_24h = client_errors_24h + server_errors_24h
    failure_rate_percent_24h = 0.0
    if audited_events_24h > 0:
        failure_rate_percent_24h = round((failed_events_24h / audited_events_24h) * 100, 2)

    return {
        "generated_at": now,
        "cursor": now,
        "is_incremental": since is not None,
        "process": summary["process"],
        "config": {
            "window_minutes": bounded_window_minutes,
            "blank_rate_threshold": blank_rate_threshold,
            "inactivity_minutes": inactivity_minutes,
            "spike_threshold": spike_threshold,
            "series_limit": bounded_series_limit,
        },
        "kpis": {
            "total_votes": total_votes,
            "total_blank_votes": total_blank_votes,
            "blank_vote_percent": blank_vote_percent,
            "enabled_census_count": enabled_census_count,
            "unique_voters_count": unique_voters_count,
            "participation_percent": participation_percent,
        },
        "operational_kpis": {
            "window_hours": 24,
            "audited_events": audited_events_24h,
            "client_errors": client_errors_24h,
            "server_errors": server_errors_24h,
            "failure_rate_percent": failure_rate_percent_24h,
            "vote_submits": vote_submits_24h,
            "duplicate_submits": duplicate_submits_24h,
            "manual_regenerations": manual_regenerations_24h,
        },
        "ranking": summary["roles"] if include_ranking else [],
        "minute_series": minute_series,
        "alerts": alerts,
    }


class ElectionProcessListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        queryset = ElectionProcess.objects.annotate(votes_count=Count("votes", distinct=True)).order_by("-created_at", "-id")
        process_list = list(queryset)
        process_ids = [str(process.id) for process in process_list]

        observer_congrats_summary_by_process: dict[int, dict] = {}
        if process_ids:
            congrats_logs = AuditLog.objects.filter(
                event_type="ELECTION_OBSERVER_CONGRATS_AUTOGEN",
                object_type="ElectionProcess",
                object_id__in=process_ids,
                status_code=status.HTTP_200_OK,
            ).order_by("-created_at", "-id")

            for log_item in congrats_logs:
                try:
                    process_id = int(log_item.object_id)
                except (TypeError, ValueError):
                    continue
                if process_id in observer_congrats_summary_by_process:
                    continue
                metadata = log_item.metadata if isinstance(log_item.metadata, dict) else {}
                observer_congrats_summary_by_process[process_id] = metadata

        serializer = ElectionProcessManageSerializer(
            process_list,
            many=True,
            context={"observer_congrats_summary_by_process": observer_congrats_summary_by_process},
        )
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = ElectionProcessCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionProcessManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ElectionProcessDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def patch(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ElectionProcessUpdateSerializer(instance=process, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        refreshed = ElectionProcess.objects.annotate(votes_count=Count("votes", distinct=True)).filter(id=process.id).first()
        return Response(ElectionProcessManageSerializer(refreshed).data)

    def delete(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        if VoteRecord.objects.filter(process_id=process.id).exists():
            return Response(
                {"detail": "No se puede eliminar la jornada porque ya tiene votos registrados."},
                status=status.HTTP_409_CONFLICT,
            )

        process.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionProcessOpenAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, process_id: int, *args, **kwargs):
        with transaction.atomic():
            process = ElectionProcess.objects.select_for_update().filter(id=process_id).first()
            if process is None:
                log_event(
                    request,
                    event_type="ELECTION_PROCESS_OPEN_FAILED",
                    object_type="ElectionProcess",
                    object_id=process_id,
                    status_code=status.HTTP_404_NOT_FOUND,
                    metadata={"reason": "process_not_found"},
                )
                return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

            opening_record = ElectionOpeningRecord.objects.filter(process=process).first()
            votes_count = process.votes.count()
            blank_votes_count = process.votes.filter(is_blank=True).count()

            if opening_record is None:
                if votes_count > 0:
                    log_event(
                        request,
                        event_type="ELECTION_PROCESS_OPEN_FAILED",
                        object_type="ElectionProcess",
                        object_id=process.id,
                        status_code=status.HTTP_409_CONFLICT,
                        metadata={"reason": "already_has_votes", "votes_count": votes_count},
                    )
                    return Response(
                        {
                            "detail": "No se puede certificar apertura en cero porque ya existen votos registrados en la jornada.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                ElectionOpeningRecord.objects.create(
                    process=process,
                    opened_by=request.user,
                    votes_count_at_open=votes_count,
                    blank_votes_count_at_open=blank_votes_count,
                    metadata={"verified_zero": votes_count == 0},
                )

            process.status = ElectionProcess.Status.OPEN
            if process.starts_at is None:
                process.starts_at = timezone.now()
            process.save(update_fields=["status", "starts_at", "updated_at"])

        log_event(
            request,
            event_type="ELECTION_PROCESS_OPEN",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"status": process.status},
        )

        return Response(ElectionProcessManageSerializer(process).data)


class ElectionProcessCloseAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, process_id: int, *args, **kwargs):
        process_id_for_job: int | None = None
        actor_id: int | None = request.user.id if request.user and request.user.is_authenticated else None
        observer_congrats_summary: dict | None = None
        observer_congrats_generated = False

        with transaction.atomic():
            process = ElectionProcess.objects.select_for_update().filter(id=process_id).first()
            if process is None:
                log_event(
                    request,
                    event_type="ELECTION_PROCESS_CLOSE_FAILED",
                    object_type="ElectionProcess",
                    object_id=process_id,
                    status_code=status.HTTP_404_NOT_FOUND,
                    metadata={"reason": "process_not_found"},
                )
                return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

            if process.status == ElectionProcess.Status.CLOSED:
                return Response(
                    {
                        **ElectionProcessManageSerializer(process).data,
                        "observer_congrats_generated": False,
                        "observer_congrats_summary": None,
                    }
                )

            if process.status != ElectionProcess.Status.OPEN:
                log_event(
                    request,
                    event_type="ELECTION_PROCESS_CLOSE_FAILED",
                    object_type="ElectionProcess",
                    object_id=process.id,
                    status_code=status.HTTP_409_CONFLICT,
                    metadata={"reason": "process_not_open", "status": process.status},
                )
                return Response(
                    {"detail": "Solo se pueden cerrar jornadas que estén abiertas."},
                    status=status.HTTP_409_CONFLICT,
                )

            now = timezone.now()
            process.status = ElectionProcess.Status.CLOSED
            if process.ends_at is None or process.ends_at > now:
                process.ends_at = now
                process.save(update_fields=["status", "ends_at", "updated_at"])
            else:
                process.save(update_fields=["status", "updated_at"])

            process_id_for_job = int(process.id)

        log_event(
            request,
            event_type="ELECTION_PROCESS_CLOSE",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"status": process.status},
        )

        if process_id_for_job is not None:
            try:
                summary = generate_observer_congratulations_for_election(
                    process_id=process_id_for_job,
                    created_by_id=actor_id,
                )
                observer_congrats_summary = summary
                observer_congrats_generated = True
                log_event(
                    request,
                    event_type="ELECTION_OBSERVER_CONGRATS_AUTOGEN",
                    object_type="ElectionProcess",
                    object_id=process_id_for_job,
                    status_code=status.HTTP_200_OK,
                    metadata=summary,
                )
            except Exception:
                logger.exception(
                    "Failed to generate observer congratulation annotations for election process %s",
                    process_id_for_job,
                )
                log_event(
                    request,
                    event_type="ELECTION_OBSERVER_CONGRATS_AUTOGEN_FAILED",
                    object_type="ElectionProcess",
                    object_id=process_id_for_job,
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    metadata={"reason": "post_close_congratulations_failed"},
                )

        return Response(
            {
                **ElectionProcessManageSerializer(process).data,
                "observer_congrats_generated": observer_congrats_generated,
                "observer_congrats_summary": observer_congrats_summary,
            }
        )


class ElectionProcessOpeningRecordAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        opening_record = ElectionOpeningRecord.objects.select_related("opened_by").filter(process=process).first()
        if opening_record is None:
            return Response(
                {"detail": "La jornada aún no tiene registro de apertura en cero."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ElectionOpeningRecordSerializer(opening_record)
        return Response(serializer.data)


class ElectionProcessScrutinySummaryAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        return Response(build_scrutiny_summary_payload(process))


class ElectionProcessLiveDashboardAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        params, validation_response = _parse_live_dashboard_params(request)
        if validation_response is not None:
            return validation_response

        payload = _build_live_dashboard_payload_cached(process, params)

        return Response(payload)


class ElectionProcessLiveDashboardStreamAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        params, validation_response = _parse_live_dashboard_params(request)
        if validation_response is not None:
            return validation_response

        payload = _build_live_dashboard_payload_cached(process, params)

        def event_stream():
            payload_json = json.dumps(payload, cls=DjangoJSONEncoder)
            event_id = payload.get("cursor") or payload.get("generated_at") or "snapshot"
            yield "retry: 8000\n"
            yield f"id: {event_id}\n"
            yield "event: snapshot\n"
            yield f"data: {payload_json}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class ElectionProcessScrutinyExportCsvAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_CSV_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        summary = build_scrutiny_summary_payload(process)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        response["Content-Disposition"] = f'attachment; filename="escrutinio_{safe_name}_{process.id}.csv"'

        writer = csv.writer(response)
        writer.writerow(["proceso_id", process.id])
        writer.writerow(["proceso", process.name])
        writer.writerow(["estado", process.status])
        writer.writerow(["generado_en", summary["summary"]["generated_at"].isoformat()])
        writer.writerow(["total_votos", summary["summary"]["total_votes"]])
        writer.writerow(["total_votos_blanco", summary["summary"]["total_blank_votes"]])
        writer.writerow([])
        writer.writerow(["cargo", "codigo", "numero", "candidato", "votos", "votos_blanco_cargo", "total_cargo"])

        for role in summary["roles"]:
            candidates = role["candidates"]
            if candidates:
                for candidate in candidates:
                    writer.writerow(
                        [
                            role["title"],
                            role["code"],
                            candidate["number"],
                            candidate["name"],
                            candidate["votes"],
                            role["blank_votes"],
                            role["total_votes"],
                        ]
                    )
            else:
                writer.writerow([role["title"], role["code"], "", "", 0, role["blank_votes"], role["total_votes"]])

        log_event(
            request,
            event_type="ELECTION_SCRUTINY_EXPORT_CSV",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"roles": len(summary["roles"]), "total_votes": summary["summary"]["total_votes"]},
        )

        return response


class ElectionProcessScrutinyExportXlsxAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_XLSX_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        summary = build_scrutiny_summary_payload(process)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Escrutinio"

        sheet.append(["Proceso ID", process.id])
        sheet.append(["Proceso", process.name])
        sheet.append(["Estado", process.status])
        sheet.append(["Generado en", summary["summary"]["generated_at"].isoformat()])
        sheet.append(["Total votos", summary["summary"]["total_votes"]])
        sheet.append(["Total votos en blanco", summary["summary"]["total_blank_votes"]])
        sheet.append([])
        sheet.append(["Cargo", "Código", "Número", "Candidato", "Votos", "Votos en blanco cargo", "Total cargo"])

        for role in summary["roles"]:
            candidates = role["candidates"]
            if candidates:
                for candidate in candidates:
                    sheet.append(
                        [
                            role["title"],
                            role["code"],
                            candidate["number"],
                            candidate["name"],
                            candidate["votes"],
                            role["blank_votes"],
                            role["total_votes"],
                        ]
                    )
            else:
                sheet.append([role["title"], role["code"], "", "", 0, role["blank_votes"], role["total_votes"]])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="escrutinio_{safe_name}_{process.id}.xlsx"'

        log_event(
            request,
            event_type="ELECTION_SCRUTINY_EXPORT_XLSX",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"roles": len(summary["roles"]), "total_votes": summary["summary"]["total_votes"]},
        )

        return response


class ElectionProcessScrutinyExportPdfAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_PDF_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        summary = build_scrutiny_summary_payload(process)
        html = render_to_string(
            "elections/reports/scrutiny_acta_pdf.html",
            {
                "process": process,
                "summary": summary,
            },
        )

        try:
            from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

            pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        except WeasyPrintUnavailableError as e:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_PDF_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                metadata={"reason": "weasyprint_unavailable"},
            )
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_PDF_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                metadata={"reason": "unexpected_exception"},
            )
            return Response({"detail": "No se pudo generar el PDF del acta de escrutinio."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not pdf_bytes:
            log_event(
                request,
                event_type="ELECTION_SCRUTINY_EXPORT_PDF_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                metadata={"reason": "empty_pdf"},
            )
            return Response({"detail": "No se pudo generar el PDF del acta de escrutinio."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="escrutinio_{safe_name}_{process.id}.pdf"'

        log_event(
            request,
            event_type="ELECTION_SCRUTINY_EXPORT_PDF",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"bytes": len(pdf_bytes)},
        )

        return response


class ElectionRoleListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = (
            ElectionRole.objects.select_related("process")
            .annotate(
                votes_count=Count("votes", distinct=True),
                candidates_count=Count("candidates", distinct=True),
            )
            .all()
            .order_by("process_id", "display_order", "id")
        )
        if process_id:
            try:
                queryset = queryset.filter(process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionRoleManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = ElectionRoleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionRoleManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ElectionRoleDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, role_id: int, *args, **kwargs):
        role = ElectionRole.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "No se encontró el cargo electoral."}, status=status.HTTP_404_NOT_FOUND)

        if VoteRecord.objects.filter(role_id=role.id).exists():
            return Response(
                {"detail": "No se puede eliminar el cargo porque ya tiene votos registrados."},
                status=status.HTTP_409_CONFLICT,
            )

        if ElectionCandidate.objects.filter(role_id=role.id).exists():
            return Response(
                {"detail": "No se puede eliminar el cargo porque tiene candidaturas asociadas."},
                status=status.HTTP_409_CONFLICT,
            )

        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PersoneriaCandidateListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = CandidatoPersoneria.objects.select_related("role", "role__process").all().order_by("role_id", "display_order", "id")
        if process_id:
            try:
                queryset = queryset.filter(role__process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionCandidateManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = CandidatoPersoneriaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionCandidateManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class PersoneriaCandidateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, candidate_id: int, *args, **kwargs):
        candidate = CandidatoPersoneria.objects.filter(id=candidate_id).first()
        if candidate is None:
            return Response({"detail": "No se encontró la candidatura de Personería."}, status=status.HTTP_404_NOT_FOUND)

        candidate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContraloriaCandidateListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = CandidatoContraloria.objects.select_related("role", "role__process").all().order_by("role_id", "display_order", "id")
        if process_id:
            try:
                queryset = queryset.filter(role__process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionCandidateManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = CandidatoContraloriaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionCandidateManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ContraloriaCandidateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, candidate_id: int, *args, **kwargs):
        candidate = CandidatoContraloria.objects.filter(id=candidate_id).first()
        if candidate is None:
            return Response({"detail": "No se encontró la candidatura de Contraloría."}, status=status.HTTP_404_NOT_FOUND)

        candidate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionTokenEligibilityIssuesAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        raw_limit = request.query_params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 200
        except (TypeError, ValueError):
            limit = 200

        limit = max(1, min(limit, 1000))

        queryset = VoterToken.objects.select_related("process").order_by("-created_at", "-id")
        if process_id:
            try:
                queryset = queryset.filter(process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        census_rows = list(
            ElectionCensusMember.objects.values(
                "student_external_id",
                "document_number",
                "grade",
                "shift",
                "is_active",
                "status",
            )
        )

        has_census_members = len(census_rows) > 0
        member_by_external_id: dict[str, dict] = {}
        member_by_document: dict[str, dict] = {}
        active_census_rows: list[dict] = []

        for row in census_rows:
            external_id = str(row.get("student_external_id") or "").strip()
            document_number = str(row.get("document_number") or "").strip()
            if external_id and external_id not in member_by_external_id:
                member_by_external_id[external_id] = row
            if document_number and document_number not in member_by_document:
                member_by_document[document_number] = row

            if bool(row.get("is_active")) and row.get("status") == ElectionCensusMember.Status.ACTIVE:
                active_census_rows.append(row)

        scope_eligibility_cache: dict[tuple[str, str], str | None] = {}

        def get_token_eligibility_error_optimized(token: VoterToken) -> str | None:
            if not has_census_members:
                return None

            metadata = token.metadata if isinstance(token.metadata, dict) else {}
            student_external_id = str(metadata.get("student_external_id") or metadata.get("external_id") or "").strip()
            document_number = str(metadata.get("document_number") or "").strip()

            if getattr(settings, "ELECTIONS_REQUIRE_TOKEN_IDENTITY", False) and not (student_external_id or document_number):
                return "El token no incluye identidad verificable del votante para validación electoral."

            member = None
            if student_external_id:
                member = member_by_external_id.get(student_external_id)
            elif document_number:
                member = member_by_document.get(document_number)

            if member is not None:
                if not bool(member.get("is_active")) or member.get("status") != ElectionCensusMember.Status.ACTIVE:
                    return "El votante asociado al token no se encuentra activo en el censo electoral."

                member_grade = str(member.get("grade") or "")
                member_shift = str(member.get("shift") or "")
                if not _is_grade_in_census_scope(member_grade):
                    return "El votante asociado al token no está en el rango de grados habilitado (1° a 11°)."

                token_grade = (token.student_grade or "").strip()
                token_shift = (token.student_shift or "").strip()

                if token_grade and not _is_grade_in_census_scope(token_grade):
                    return "El token no está en el rango de grados habilitado (1° a 11°)."

                if token_grade and _normalize_scope_value(member_grade) != _normalize_scope_value(token_grade):
                    return "El token no coincide con el grado habilitado en el censo electoral."

                if token_shift and _normalize_scope_value(member_shift) != _normalize_scope_value(token_shift):
                    return "El token no coincide con la jornada habilitada en el censo electoral."

                return None

            if student_external_id or document_number:
                return "No se encontró el votante asociado al token en el censo electoral sincronizado."

            token_grade = (token.student_grade or "").strip()
            token_shift = (token.student_shift or "").strip()

            if token_grade and not _is_grade_in_census_scope(token_grade):
                return "El token no está en el rango de grados habilitado (1° a 11°)."

            normalized_grade = _normalize_scope_value(token_grade)
            normalized_shift = _normalize_scope_value(token_shift)
            cache_key = (normalized_grade, normalized_shift)
            if cache_key in scope_eligibility_cache:
                return scope_eligibility_cache[cache_key]

            token_grade_int = _grade_value_from_text(token_grade) if token_grade else None
            has_match = False
            for row in active_census_rows:
                member_shift = str(row.get("shift") or "")
                if token_shift and _normalize_scope_value(member_shift) != normalized_shift:
                    continue

                member_grade = str(row.get("grade") or "")
                member_grade_int = _grade_value_from_text(member_grade)
                if member_grade_int is None or not (1 <= member_grade_int <= 11):
                    continue
                if token_grade_int is not None and member_grade_int != token_grade_int:
                    continue

                has_match = True
                break

            scope_eligibility_cache[cache_key] = None if has_match else "El token no cumple criterios de elegibilidad del censo electoral sincronizado."
            return scope_eligibility_cache[cache_key]

        scanned_count = 0
        issues: list[dict] = []

        for token in queryset.iterator():
            scanned_count += 1
            error = get_token_eligibility_error_optimized(token)
            if error:
                issues.append(
                    {
                        "token_id": token.id,
                        "process_id": token.process_id,
                        "process_name": token.process.name,
                        "token_prefix": token.token_prefix,
                        "status": token.status,
                        "student_grade": token.student_grade,
                        "student_shift": token.student_shift,
                        "metadata": token.metadata,
                        "error": error,
                    }
                )
                if len(issues) >= limit:
                    break

        serializer = ElectionTokenEligibilityIssueSerializer(issues, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
                "limit": limit,
                "scanned_count": scanned_count,
            }
        )


class ElectionEligibleStudentsAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        role_code = str(request.query_params.get("role_code") or "").strip().upper()
        if role_code not in {ElectionRole.CODE_PERSONERO, ElectionRole.CODE_CONTRALOR}:
            return Response(
                {"detail": "El parámetro role_code es obligatorio y debe ser PERSONERO o CONTRALOR."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        process_id_raw = request.query_params.get("process_id")
        process_id = None
        if process_id_raw not in (None, ""):
            try:
                process_id = int(process_id_raw)
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

            if not ElectionProcess.objects.filter(id=process_id).exists():
                return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        q = str(request.query_params.get("q") or "").strip()
        show_blocked = str(request.query_params.get("show_blocked") or "").strip().lower() in {"1", "true", "yes"}
        raw_limit = request.query_params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 20
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        year = (
            AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE)
            .order_by("-year", "-id")
            .only("id", "year")
            .first()
        )
        if year is None:
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "limit": limit,
                    "academic_year": None,
                    "role_code": role_code,
                }
            )

        queryset = (
            Enrollment.objects.select_related("student__user", "grade", "group")
            .filter(status="ACTIVE", academic_year_id=year.id)
            .order_by("student__user__first_name", "student__user__last_name", "id")
        )

        if q:
            queryset = queryset.filter(
                Q(student__user__first_name__icontains=q)
                | Q(student__user__last_name__icontains=q)
                | Q(student__user__username__icontains=q)
                | Q(student__document_number__icontains=q)
            )

        existing_candidate_names: set[str] = set()
        existing_candidate_student_ids: set[int] = set()
        existing_candidate_documents: set[str] = set()
        if process_id is not None:
            existing_candidates_qs = ElectionCandidate.objects.filter(role__process_id=process_id)
            existing_candidate_names = {
                (name or "").strip().lower()
                for name in existing_candidates_qs.values_list("name", flat=True)
            }
            existing_candidate_student_ids = {
                int(student_id)
                for student_id in existing_candidates_qs.filter(student_id_ref__isnull=False).values_list("student_id_ref", flat=True)
            }
            existing_candidate_documents = {
                (document or "").strip().lower()
                for document in existing_candidates_qs.values_list("student_document_number", flat=True)
                if str(document or "").strip()
            }

        results: list[dict] = []
        blocked_results: list[dict] = []
        for enrollment in queryset.iterator():
            grade_value = _grade_value_for_enrollment(enrollment)
            if role_code == ElectionRole.CODE_PERSONERO and grade_value != 11:
                continue
            if role_code == ElectionRole.CODE_CONTRALOR and (grade_value is None or not (6 <= grade_value <= 11)):
                continue

            full_name = (enrollment.student.user.get_full_name() or enrollment.student.user.username or "").strip()
            if not full_name:
                continue

            normalized_name = full_name.lower()
            normalized_document = (enrollment.student.document_number or "").strip().lower()
            block_reason = ""
            if normalized_name in existing_candidate_names:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."
            elif enrollment.student_id in existing_candidate_student_ids:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."
            elif normalized_document and normalized_document in existing_candidate_documents:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."

            group_name = enrollment.group.name if enrollment.group_id and enrollment.group else ""
            shift_value = enrollment.group.shift if enrollment.group_id and enrollment.group else ""

            row = {
                "student_id": enrollment.student_id,
                "enrollment_id": enrollment.id,
                "full_name": full_name,
                "document_number": (enrollment.student.document_number or "").strip(),
                "grade": str(grade_value if grade_value is not None else (enrollment.grade.name or "")).strip(),
                "group": group_name,
                "shift": shift_value,
                "is_blocked": bool(block_reason),
                "block_reason": block_reason,
            }

            if block_reason:
                if show_blocked and len(blocked_results) < limit:
                    blocked_results.append(row)
                continue

            results.append(row)

            if len(results) >= limit and (not show_blocked or len(blocked_results) >= limit):
                break

        return Response(
            {
                "results": results,
                "count": len(results),
                "limit": limit,
                "blocked_results": blocked_results,
                "blocked_count": len(blocked_results),
                "academic_year": {"id": year.id, "year": year.year},
                "role_code": role_code,
            }
        )


def _resolve_student_id_for_member(member: ElectionCensusMember) -> int | None:
    metadata = member.metadata if isinstance(member.metadata, dict) else {}
    student_id_raw = metadata.get("student_id")
    if isinstance(student_id_raw, int):
        return student_id_raw
    if isinstance(student_id_raw, str) and student_id_raw.strip().isdigit():
        return int(student_id_raw.strip())
    if member.student_external_id.isdigit():
        return int(member.student_external_id)
    return None


def _normalize_student_id_value(value) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _normalize_string_identity(value) -> str:
    return str(value or "").strip().lower()


def _append_identity_keys(identity_keys: set[str], *, student_id: int | None, student_external_id: str, document_number: str) -> None:
    if student_id is not None:
        identity_keys.add(f"sid:{student_id}")

    normalized_external = _normalize_string_identity(student_external_id)
    if normalized_external:
        identity_keys.add(f"sex:{normalized_external}")

    normalized_document = _normalize_string_identity(document_number)
    if normalized_document:
        identity_keys.add(f"doc:{normalized_document}")


def _build_student_completed_vote_index(*, process: ElectionProcess, required_role_ids: set[int]) -> dict[str, bool]:
    if not required_role_ids:
        return {}

    roles_by_identity: dict[str, set[int]] = {}
    vote_rows = VoteRecord.objects.filter(process=process).values("role_id", "voter_token__metadata")

    for vote_row in vote_rows.iterator():
        metadata = vote_row.get("voter_token__metadata")
        if not isinstance(metadata, dict):
            continue

        vote_identity_keys: set[str] = set()
        student_id = _normalize_student_id_value(metadata.get("student_id"))
        student_external_id = str(metadata.get("student_external_id") or metadata.get("external_id") or "")
        document_number = str(metadata.get("document_number") or "")
        _append_identity_keys(
            vote_identity_keys,
            student_id=student_id,
            student_external_id=student_external_id,
            document_number=document_number,
        )

        if not vote_identity_keys:
            continue

        role_id = vote_row.get("role_id")
        if not isinstance(role_id, int):
            continue

        for identity_key in vote_identity_keys:
            identity_roles = roles_by_identity.setdefault(identity_key, set())
            identity_roles.add(role_id)

    completed_vote_index: dict[str, bool] = {}
    expected_roles_count = len(required_role_ids)
    for identity_key, identity_roles in roles_by_identity.items():
        completed_vote_index[identity_key] = len(identity_roles.intersection(required_role_ids)) == expected_roles_count

    return completed_vote_index


def _resolve_row_completed_vote(
    *,
    completed_vote_index: dict[str, bool],
    student_id: int | None,
    student_external_id: str,
    document_number: str,
) -> bool:
    identity_keys: set[str] = set()
    _append_identity_keys(
        identity_keys,
        student_id=student_id,
        student_external_id=student_external_id,
        document_number=document_number,
    )
    if not identity_keys:
        return False

    return any(completed_vote_index.get(identity_key, False) for identity_key in identity_keys)


def _build_process_census_rows(process: ElectionProcess) -> list[dict]:
    members = list(
        ElectionCensusMember.objects.filter(is_active=True, status=ElectionCensusMember.Status.ACTIVE).order_by("id")
    )
    excluded_member_ids = set(
        ElectionProcessCensusExclusion.objects.filter(process=process).values_list("census_member_id", flat=True)
    )

    student_ids: set[int] = set()
    for member in members:
        student_id = _resolve_student_id_for_member(member)
        if student_id is not None:
            student_ids.add(student_id)

    active_year = (
        AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE)
        .order_by("-year", "-id")
        .only("id", "year")
        .first()
    )
    enrollments = Enrollment.objects.select_related("grade", "group")
    if active_year is not None:
        enrollments = enrollments.filter(academic_year_id=active_year.id)
    if student_ids:
        enrollments = enrollments.filter(student_id__in=student_ids, status="ACTIVE")
    else:
        enrollments = enrollments.none()

    enrollment_by_student: dict[int, Enrollment] = {enrollment.student_id: enrollment for enrollment in enrollments}

    required_role_ids = set(process.roles.values_list("id", flat=True))
    completed_vote_index = _build_student_completed_vote_index(process=process, required_role_ids=required_role_ids)

    rows: list[dict] = []
    for member in members:
        student_id = _resolve_student_id_for_member(member)
        enrollment = enrollment_by_student.get(student_id) if student_id is not None else None
        metadata = member.metadata if isinstance(member.metadata, dict) else {}

        grade_value = _grade_value_from_text(member.grade)
        if enrollment is not None and enrollment.grade.ordinal is not None:
            grade_value = enrollment.grade.ordinal

        group_name = ""
        if enrollment is not None and enrollment.group_id and enrollment.group:
            group_name = enrollment.group.name or ""
        elif isinstance(metadata.get("group"), str):
            group_name = str(metadata.get("group") or "")

        is_excluded = member.id in excluded_member_ids
        has_completed_vote = _resolve_row_completed_vote(
            completed_vote_index=completed_vote_index,
            student_id=student_id,
            student_external_id=member.student_external_id,
            document_number=member.document_number,
        )
        rows.append(
            {
                "member_id": member.id,
                "student_external_id": member.student_external_id,
                "student_id": student_id,
                "document_number": member.document_number,
                "full_name": member.full_name,
                "grade": member.grade,
                "grade_value": grade_value,
                "group": group_name,
                "shift": member.shift,
                "campus": member.campus,
                "is_excluded": is_excluded,
                "is_enabled": not is_excluded,
                "has_completed_vote": has_completed_vote,
            }
        )

    rows.sort(
        key=lambda row: (
            row["grade_value"] if row["grade_value"] is not None else -1,
            _group_sort_value(row["group"]),
            (row["full_name"] or "").upper(),
        ),
        reverse=True,
    )
    return rows


def _issue_manual_token_for_row(process: ElectionProcess, row: dict) -> str:
    return _issue_manual_token_for_row_with_reason(process, row, revoked_reason="Regeneración de código manual para censo por jornada.")


def _issue_manual_token_for_row_with_reason(process: ElectionProcess, row: dict, *, revoked_reason: str) -> str:
    student_external_id = str(row.get("student_external_id") or "").strip()
    if student_external_id:
        VoterToken.objects.filter(
            process=process,
            metadata__student_external_id=student_external_id,
            status=VoterToken.Status.ACTIVE,
        ).update(
            status=VoterToken.Status.REVOKED,
            revoked_at=timezone.now(),
            revoked_reason=revoked_reason,
        )

    raw_token = f"VOTO-{secrets.token_hex(5).upper()}"
    token_hash = VoterToken.hash_token(raw_token)
    now = timezone.now()
    expires_at = process.ends_at
    if expires_at is None or expires_at <= now:
        expires_at = timezone.now() + timedelta(hours=24)

    VoterToken.objects.create(
        process=process,
        token_hash=token_hash,
        token_prefix=raw_token[:12],
        status=VoterToken.Status.ACTIVE,
        expires_at=expires_at,
        student_grade=str(row.get("grade") or ""),
        student_shift=str(row.get("shift") or ""),
        metadata={
            "student_external_id": student_external_id,
            "student_id": row.get("student_id"),
            "document_number": row.get("document_number") or "",
            "full_name": row.get("full_name") or "",
            "group": row.get("group") or "",
            "manual_code": raw_token,
            "issued_from": "process_census",
        },
    )
    return raw_token


def _issue_manual_token_for_row_without_revocation(process: ElectionProcess, row: dict) -> str:
    raw_token = f"VOTO-{secrets.token_hex(5).upper()}"
    token_hash = VoterToken.hash_token(raw_token)
    now = timezone.now()
    expires_at = process.ends_at
    if expires_at is None or expires_at <= now:
        expires_at = timezone.now() + timedelta(hours=24)

    VoterToken.objects.create(
        process=process,
        token_hash=token_hash,
        token_prefix=raw_token[:12],
        status=VoterToken.Status.ACTIVE,
        expires_at=expires_at,
        student_grade=str(row.get("grade") or ""),
        student_shift=str(row.get("shift") or ""),
        metadata={
            "student_external_id": str(row.get("student_external_id") or "").strip(),
            "student_id": row.get("student_id"),
            "document_number": row.get("document_number") or "",
            "full_name": row.get("full_name") or "",
            "group": row.get("group") or "",
            "manual_code": raw_token,
            "issued_from": "process_census",
        },
    )
    return raw_token


def _parse_manual_code_mode(request) -> tuple[str, bool, str | None, str | None]:
    mode_raw = str(request.query_params.get("mode") or "existing").strip().lower()
    if mode_raw not in {"existing", "regenerate"}:
        return "", False, None, "El parámetro mode debe ser existing o regenerate."

    if mode_raw == "existing":
        return mode_raw, False, None, None

    confirm_regeneration = str(request.query_params.get("confirm_regeneration") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if not confirm_regeneration:
        return "", False, None, "Debes confirmar la regeneración con confirm_regeneration=true."

    regeneration_reason = str(request.query_params.get("regeneration_reason") or "").strip()
    if len(regeneration_reason) < 10:
        return "", False, None, "Debes indicar un motivo de regeneración (mínimo 10 caracteres)."

    return mode_raw, confirm_regeneration, regeneration_reason, None


def _resolve_manual_code_for_row(
    *,
    process: ElectionProcess,
    row: dict,
    mode: str,
    regeneration_reason: str | None,
) -> tuple[str, bool]:
    student_external_id = str(row.get("student_external_id") or "").strip()
    if student_external_id:
        existing_token = (
            VoterToken.objects.filter(
                process=process,
                metadata__student_external_id=student_external_id,
                status=VoterToken.Status.ACTIVE,
                metadata__manual_code__isnull=False,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if existing_token is not None:
            metadata = existing_token.metadata if isinstance(existing_token.metadata, dict) else {}
            manual_code = str(metadata.get("manual_code") or "").strip()
            if manual_code:
                return manual_code, False

    if mode == "existing":
        return _issue_manual_token_for_row_without_revocation(process, row), True

    revoked_reason = f"Regeneración de código manual para censo por jornada. Motivo: {regeneration_reason}" if regeneration_reason else "Regeneración de código manual para censo por jornada."
    return _issue_manual_token_for_row_with_reason(process, row, revoked_reason=revoked_reason), True


class ElectionCensusSyncFromEnrollmentsAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, *args, **kwargs):
        previous_sync_id = (
            ElectionCensusSync.objects.order_by("-started_at", "-id").values_list("id", flat=True).first()
        )

        command_stdout = StringIO()
        try:
            call_command(
                "sync_election_census",
                "--source-active-enrollments",
                "--apply",
                stdout=command_stdout,
            )
        except Exception:
            return Response(
                {"detail": "No fue posible sincronizar censo desde matrículas activas."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        latest_sync = ElectionCensusSync.objects.order_by("-started_at", "-id").first()
        if latest_sync is None or latest_sync.id == previous_sync_id:
            return Response(
                {"detail": "La sincronización no generó resultados."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Censo sincronizado desde matrículas activas.",
                "sync": {
                    "id": latest_sync.id,
                    "status": latest_sync.status,
                    "received_count": latest_sync.received_count,
                    "created_count": latest_sync.created_count,
                    "updated_count": latest_sync.updated_count,
                    "deactivated_count": latest_sync.deactivated_count,
                    "unchanged_count": latest_sync.unchanged_count,
                    "errors_count": latest_sync.errors_count,
                    "started_at": latest_sync.started_at,
                    "finished_at": latest_sync.finished_at,
                },
            }
        )


class ElectionProcessCensusAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("page_size", 10))
        except (TypeError, ValueError):
            page_size = 10
        search_query = str(request.query_params.get("q") or "").strip().lower()
        voted_filter = str(request.query_params.get("voted") or "").strip().lower()

        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        rows = _build_process_census_rows(process)
        if voted_filter:
            voted_true_values = {"1", "true", "yes", "si", "sí", "voted"}
            voted_false_values = {"0", "false", "no", "not_voted"}
            if voted_filter in voted_true_values:
                rows = [row for row in rows if row.get("has_completed_vote") is True]
            elif voted_filter in voted_false_values:
                rows = [row for row in rows if row.get("has_completed_vote") is False]
            else:
                return Response(
                    {"detail": "El parámetro voted debe ser voted/not_voted o true/false."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if search_query:
            rows = [
                row
                for row in rows
                if search_query in str(row.get("full_name") or "").lower()
                or search_query in str(row.get("document_number") or "").lower()
                or search_query in str(row.get("group") or "").lower()
                or search_query in str(row.get("grade") or "").lower()
                or search_query in str(row.get("shift") or "").lower()
                or search_query in str(row.get("campus") or "").lower()
                or search_query in str(row.get("student_external_id") or "").lower()
            ]
        total_count = len(rows)
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        if page > total_pages:
            page = total_pages

        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_rows = rows[start_index:end_index]

        group_names = sorted({row["group"] for row in rows if row["group"]}, key=_group_sort_value, reverse=True)
        return Response(
            {
                "process": {"id": process.id, "name": process.name, "status": process.status},
                "results": paginated_rows,
                "count": len(paginated_rows),
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "enabled_count": sum(1 for row in rows if row["is_enabled"]),
                "excluded_count": sum(1 for row in rows if row["is_excluded"]),
                "groups": group_names,
            }
        )


class ElectionProcessCensusExcludeAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MEMBER_EXCLUDE_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        member_id = request.data.get("member_id")
        try:
            member_id = int(member_id)
        except (TypeError, ValueError):
            log_event(
                request,
                event_type="ELECTION_CENSUS_MEMBER_EXCLUDE_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_400_BAD_REQUEST,
                metadata={"reason": "invalid_member_id"},
            )
            return Response({"detail": "member_id es obligatorio y debe ser numérico."}, status=status.HTTP_400_BAD_REQUEST)

        member = ElectionCensusMember.objects.filter(id=member_id, is_active=True, status=ElectionCensusMember.Status.ACTIVE).first()
        if member is None:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MEMBER_EXCLUDE_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "member_not_found", "member_id": member_id},
            )
            return Response({"detail": "No se encontró el estudiante activo en censo."}, status=status.HTTP_404_NOT_FOUND)

        reason = str(request.data.get("reason") or "").strip()
        exclusion, created = ElectionProcessCensusExclusion.objects.get_or_create(
            process=process,
            census_member=member,
            defaults={"reason": reason, "created_by": request.user},
        )
        if not created and reason:
            exclusion.reason = reason
            exclusion.save(update_fields=["reason"])

        log_event(
            request,
            event_type="ELECTION_CENSUS_MEMBER_EXCLUDE",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={"member_id": member.id, "created": created},
        )

        return Response({"detail": "Estudiante excluido de la jornada."})


class ElectionProcessCensusIncludeAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, process_id: int, member_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MEMBER_INCLUDE_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found", "member_id": member_id},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        deleted, _ = ElectionProcessCensusExclusion.objects.filter(process=process, census_member_id=member_id).delete()
        if deleted == 0:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MEMBER_INCLUDE_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "member_not_excluded", "member_id": member_id},
            )
            return Response({"detail": "El estudiante no estaba excluido para esta jornada."}, status=status.HTTP_404_NOT_FOUND)

        log_event(
            request,
            event_type="ELECTION_CENSUS_MEMBER_INCLUDE",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_204_NO_CONTENT,
            metadata={"member_id": member_id},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionProcessCensusManualCodesXlsxAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MANUAL_CODES_EXPORT_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        group_filter = str(request.query_params.get("group") or "").strip()
        mode, _, regeneration_reason, mode_error = _parse_manual_code_mode(request)
        if mode_error:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MANUAL_CODES_EXPORT_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_400_BAD_REQUEST,
                metadata={"reason": "invalid_mode", "group": group_filter or "", "mode": str(request.query_params.get("mode") or "")},
            )
            return Response({"detail": mode_error}, status=status.HTTP_400_BAD_REQUEST)

        rows = [row for row in _build_process_census_rows(process) if row["is_enabled"]]
        if group_filter:
            rows = [row for row in rows if (row.get("group") or "") == group_filter]

        if not rows:
            log_event(
                request,
                event_type="ELECTION_CENSUS_MANUAL_CODES_EXPORT_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_400_BAD_REQUEST,
                metadata={"reason": "no_enabled_rows", "group": group_filter or ""},
            )
            return Response({"detail": "No hay estudiantes habilitados para exportar en la selección actual."}, status=status.HTTP_400_BAD_REQUEST)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Códigos"
        sheet.append(["Proceso", process.name])
        sheet.append(["Grupo", group_filter or "Todos"])
        sheet.append(["Modo", "Solo existentes" if mode == "existing" else "Regenerar"])
        sheet.append(["Generado en", timezone.now().isoformat()])
        sheet.append([])
        sheet.append(["Grado", "Grupo", "Estudiante", "Documento", "Votó", "Código manual"])

        generated_count = 0
        reused_count = 0
        missing_count = 0

        for row in rows:
            manual_code, generated = _resolve_manual_code_for_row(
                process=process,
                row=row,
                mode=mode,
                regeneration_reason=regeneration_reason,
            )
            if generated:
                generated_count += 1
            elif manual_code:
                reused_count += 1
            else:
                missing_count += 1
            sheet.append([
                row.get("grade") or "",
                row.get("group") or "",
                row.get("full_name") or "",
                row.get("document_number") or "",
                "Sí" if row.get("has_completed_vote") else "No",
                manual_code,
            ])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        group_suffix = (group_filter or "todos").replace('"', '').replace(',', '').replace(' ', '_')
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="censo_codigos_{safe_name}_{group_suffix}.xlsx"'

        log_event(
            request,
            event_type="ELECTION_CENSUS_MANUAL_CODES_EXPORT",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={
                "group": group_filter or "",
                "rows": len(rows),
                "mode": mode,
                "regeneration_reason": regeneration_reason or "",
                "generated_count": generated_count,
                "reused_count": reused_count,
                "missing_count": missing_count,
            },
        )

        return response


class ElectionProcessCensusQrPrintAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            log_event(
                request,
                event_type="ELECTION_CENSUS_QR_PRINT_FAILED",
                object_type="ElectionProcess",
                object_id=process_id,
                status_code=status.HTTP_404_NOT_FOUND,
                metadata={"reason": "process_not_found"},
            )
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        group_filter = str(request.query_params.get("group") or "").strip()
        mode, _, regeneration_reason, mode_error = _parse_manual_code_mode(request)
        if mode_error:
            log_event(
                request,
                event_type="ELECTION_CENSUS_QR_PRINT_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_400_BAD_REQUEST,
                metadata={"reason": "invalid_mode", "group": group_filter or "", "mode": str(request.query_params.get("mode") or "")},
            )
            return Response({"detail": mode_error}, status=status.HTTP_400_BAD_REQUEST)

        rows = [row for row in _build_process_census_rows(process) if row["is_enabled"]]
        if group_filter:
            rows = [row for row in rows if (row.get("group") or "") == group_filter]

        if not rows:
            log_event(
                request,
                event_type="ELECTION_CENSUS_QR_PRINT_FAILED",
                object_type="ElectionProcess",
                object_id=process.id,
                status_code=status.HTTP_400_BAD_REQUEST,
                metadata={"reason": "no_enabled_rows", "group": group_filter or ""},
            )
            return Response({"detail": "No hay estudiantes habilitados para impresión en la selección actual."}, status=status.HTTP_400_BAD_REQUEST)

        cards: list[str] = []
        generated_count = 0
        reused_count = 0
        missing_count = 0
        for row in rows:
            manual_code, generated = _resolve_manual_code_for_row(
                process=process,
                row=row,
                mode=mode,
                regeneration_reason=regeneration_reason,
            )
            if generated:
                generated_count += 1
            elif manual_code:
                reused_count += 1
            else:
                missing_count += 1
            qr_image_src = _qr_png_data_uri(manual_code)
            cards.append(
                "".join(
                    [
                        '<article class="card">',
                        f'<h3>{row.get("full_name") or "Estudiante"}</h3>',
                        f'<p><strong>Grado:</strong> {row.get("grade") or "—"} · <strong>Grupo:</strong> {row.get("group") or "—"}</p>',
                        f'<p><strong>Documento:</strong> {row.get("document_number") or "—"}</p>',
                        f'<p><strong>Código manual:</strong> <span class="code">{manual_code}</span></p>',
                        (f'<img src="{qr_image_src}" alt="QR" class="qr" />' if qr_image_src else ''),
                        "</article>",
                    ]
                )
            )

        html = "".join(
            [
                "<!doctype html><html><head><meta charset='utf-8' />",
                "<title>QR censo</title>",
                "<style>",
                "body{font-family:Arial,sans-serif;margin:16px;color:#0f172a}",
                "h1{font-size:18px;margin:0 0 6px}",
                "p.meta{margin:0 0 16px;font-size:12px;color:#475569}",
                ".grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
                ".card{border:1px solid #cbd5e1;border-radius:8px;padding:10px;break-inside:avoid}",
                ".card h3{margin:0 0 6px;font-size:14px}",
                ".card p{margin:2px 0;font-size:12px}",
                ".code{font-weight:700;letter-spacing:0.5px}",
                ".qr{width:120px;height:120px;margin-top:8px}",
                "@media print{body{margin:8px}.grid{gap:8px}}",
                "</style></head><body>",
                f"<h1>Censo habilitado para votación · {process.name}</h1>",
                f"<p class='meta'>Grupo: {group_filter or 'Todos'} · Generado: {timezone.now().isoformat()}</p>",
                f"<section class='grid'>{''.join(cards)}</section>",
                "</body></html>",
            ]
        )

        log_event(
            request,
            event_type="ELECTION_CENSUS_QR_PRINT",
            object_type="ElectionProcess",
            object_id=process.id,
            status_code=status.HTTP_200_OK,
            metadata={
                "group": group_filter or "",
                "rows": len(rows),
                "mode": mode,
                "regeneration_reason": regeneration_reason or "",
                "generated_count": generated_count,
                "reused_count": reused_count,
                "missing_count": missing_count,
            },
        )

        return HttpResponse(html)
