from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import HasDjangoPermission, IsAdminOrReadOnly, KampusModelPermissions

from .models import (
    NoveltyRadicadoCounter,
    NoveltyType,
    NoveltyReason,
    NoveltyCase,
    NoveltyCaseTransition,
    NoveltyRequiredDocumentRule,
    NoveltyAttachment,
    CapacityBucket,
    GroupCapacityOverride,
)
from .serializers import (
    NoveltyTypeSerializer,
    NoveltyReasonSerializer,
    NoveltyCaseSerializer,
    NoveltyCaseTransitionSerializer,
    NoveltyRequiredDocumentRuleSerializer,
    NoveltyAttachmentSerializer,
    CapacityBucketSerializer,
    GroupCapacityOverrideSerializer,
)

from .services.execution import execute_case
from .services.reversion import revert_case


class _TransitionInputSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class _ExecuteInputSerializer(serializers.Serializer):
    comment = serializers.CharField(required=True, allow_blank=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class _RevertInputSerializer(serializers.Serializer):
    comment = serializers.CharField(required=True, allow_blank=False)


def _is_graduacion_case(case: NoveltyCase) -> bool:
    try:
        code = (case.novelty_type.code or "").strip().lower()
    except Exception:
        code = ""
    return code in {"graduacion", "graduación", "graduado", "graduada"}


def _client_ip(request) -> str | None:
    # If behind proxy, you may want to use X-Forwarded-For. Keep it simple for now.
    try:
        return request.META.get("REMOTE_ADDR")
    except Exception:
        return None


def _visible_by_role_q(*, user) -> Q:
    # Visibility filtering is conservative: if role is unknown, show only ALL.
    role = getattr(user, "role", "") if user and getattr(user, "is_authenticated", False) else ""
    if role in {"SUPERADMIN", "ADMIN"}:
        return Q()  # all
    if role == "COORDINATOR":
        return Q(visibility__in=["ALL", "COORDINATOR_ONLY"])
    if role == "SECRETARY":
        return Q(visibility__in=["ALL", "SECRETARY_ONLY"])
    return Q(visibility="ALL")


def _missing_required_documents(case: NoveltyCase) -> list[str]:
    # Rules apply by type + (optional) reason. Rules with novelty_reason NULL are baseline.
    rules = NoveltyRequiredDocumentRule.objects.filter(
        novelty_type=case.novelty_type,
        is_required=True,
    ).filter(Q(novelty_reason__isnull=True) | Q(novelty_reason=case.novelty_reason))

    required = set(rules.values_list("doc_type", flat=True))
    if not required:
        return []

    present = set(case.attachments.filter(doc_type__in=required).values_list("doc_type", flat=True).distinct())
    missing = sorted(required - present)
    return missing


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    NoveltyCase.Status.DRAFT: {NoveltyCase.Status.FILED},
    NoveltyCase.Status.FILED: {NoveltyCase.Status.IN_REVIEW, NoveltyCase.Status.PENDING_DOCS, NoveltyCase.Status.REJECTED},
    NoveltyCase.Status.IN_REVIEW: {
        NoveltyCase.Status.PENDING_DOCS,
        NoveltyCase.Status.APPROVED,
        NoveltyCase.Status.REJECTED,
    },
    NoveltyCase.Status.PENDING_DOCS: {
        NoveltyCase.Status.IN_REVIEW,
        NoveltyCase.Status.REJECTED,
    },
    NoveltyCase.Status.APPROVED: {
        # Execution comes in Sprint 4; keep it reserved.
        NoveltyCase.Status.EXECUTED,
        NoveltyCase.Status.CLOSED,
    },
    NoveltyCase.Status.REJECTED: {NoveltyCase.Status.CLOSED},
    NoveltyCase.Status.EXECUTED: {NoveltyCase.Status.CLOSED, NoveltyCase.Status.REVERTED},
    NoveltyCase.Status.REVERTED: {NoveltyCase.Status.CLOSED},
    NoveltyCase.Status.CLOSED: set(),
}


def _transition_case(*, case: NoveltyCase, to_status: str, request, comment: str = "") -> NoveltyCase:
    from_status = case.status
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise serializers.ValidationError({"detail": f"Transición no permitida: {from_status} -> {to_status}"})

    actor = getattr(request, "user", None)
    actor_role = getattr(actor, "role", "") if actor and getattr(actor, "is_authenticated", False) else ""
    ip = _client_ip(request)

    NoveltyCaseTransition.objects.create(
        case=case,
        from_status=from_status,
        to_status=to_status,
        actor=actor if actor and getattr(actor, "is_authenticated", False) else None,
        actor_role=str(actor_role or ""),
        comment=str(comment or ""),
        ip_address=ip,
    )

    case.status = to_status
    if to_status == NoveltyCase.Status.REJECTED:
        case.closed_at = timezone.now()
    if to_status == NoveltyCase.Status.CLOSED:
        case.closed_at = timezone.now()

    case.save(update_fields=["status", "closed_at", "updated_at"])

    # Notifications (best-effort)
    try:
        from notifications.services import admin_like_users_qs, notify_users

        actor = getattr(request, "user", None)
        recipients = admin_like_users_qs()
        if actor and getattr(actor, "is_authenticated", False):
            recipients = recipients.exclude(id=actor.id)

        notify_users(
            recipients=recipients,
            title=f"Novedad {case.radicado or case.pk}: {to_status}",
            body=comment[:4000] if comment else "",
            url=f"/novelties/{case.pk}",
            type="NOVELTY",
            dedupe_key=f"novelty:{case.pk}:{to_status}",
            dedupe_within_seconds=30,
        )
    except Exception:
        pass

    return case


class NoveltyTypeViewSet(viewsets.ModelViewSet):
    queryset = NoveltyType.objects.all()
    serializer_class = NoveltyTypeSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_active", "code"]


class NoveltyReasonViewSet(viewsets.ModelViewSet):
    queryset = NoveltyReason.objects.select_related("novelty_type").all()
    serializer_class = NoveltyReasonSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_active", "novelty_type"]


class NoveltyCaseViewSet(viewsets.ModelViewSet):
    queryset = NoveltyCase.objects.select_related("student", "novelty_type", "novelty_reason").all()
    serializer_class = NoveltyCaseSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "novelty_type", "student"]

    @action(detail=False, methods=["get"], url_path="inbox")
    def inbox(self, request):
        user = request.user
        role = getattr(user, "role", "") if user and getattr(user, "is_authenticated", False) else ""

        default_statuses: list[str]
        if role in {"SUPERADMIN", "ADMIN"}:
            default_statuses = [
                NoveltyCase.Status.FILED,
                NoveltyCase.Status.IN_REVIEW,
                NoveltyCase.Status.PENDING_DOCS,
                NoveltyCase.Status.APPROVED,
            ]
        elif role == "COORDINATOR":
            default_statuses = [NoveltyCase.Status.IN_REVIEW]
        elif role == "SECRETARY":
            default_statuses = [NoveltyCase.Status.PENDING_DOCS]
        else:
            default_statuses = []

        qs = self.filter_queryset(self.get_queryset())
        if default_statuses:
            qs = qs.filter(status__in=default_statuses)
        else:
            qs = qs.none()

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        import csv
        from django.http import HttpResponse

        qs = self.filter_queryset(self.get_queryset()).order_by("-created_at")
        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="novelties_cases.csv"'

        writer = csv.writer(resp)
        writer.writerow([
            "id",
            "radicado",
            "status",
            "student_id",
            "institution_id",
            "novelty_type",
            "novelty_reason_id",
            "created_at",
        ])
        for c in qs[:5000]:
            writer.writerow([
                c.pk,
                c.radicado,
                c.status,
                c.student_id,
                c.institution_id,
                getattr(c.novelty_type, "code", ""),
                c.novelty_reason_id,
                c.created_at.isoformat() if c.created_at else "",
            ])
        return resp

    def get_permissions(self):
        # Custom workflow transitions should require change permission, not POST->add.
        if getattr(self, "action", None) in {
            "file",
            "send_to_review",
            "mark_pending_docs",
            "approve",
            "reject",
            "return_to_previous",
            "close",
            "execute",
            "revert",
        }:
            self.required_permission = "novelties.change_noveltycase"
            return [HasDjangoPermission()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="file")
    def file(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        if case.status != NoveltyCase.Status.DRAFT:
            return Response({"detail": "Solo se puede radicar desde BORRADOR"}, status=status.HTTP_400_BAD_REQUEST)

        if case.institution_id is None:
            return Response({"detail": "La novedad debe tener institución para generar radicado"}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        year = now.year

        with transaction.atomic():
            counter, _ = NoveltyRadicadoCounter.objects.select_for_update().get_or_create(
                institution_id=case.institution_id,
                year=year,
                defaults={"last_seq": 0},
            )
            counter.last_seq += 1
            counter.save(update_fields=["last_seq", "updated_at"])

            case.radicado_year = year
            case.radicado_seq = counter.last_seq
            case.radicado = f"NV-{year}-{counter.last_seq:06d}"
            case.filed_at = now
            case.save(update_fields=["radicado_year", "radicado_seq", "radicado", "filed_at", "updated_at"])

            _transition_case(case=case, to_status=NoveltyCase.Status.FILED, request=request, comment=data.validated_data["comment"])

        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="send-to-review")
    def send_to_review(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        _transition_case(case=case, to_status=NoveltyCase.Status.IN_REVIEW, request=request, comment=data.validated_data["comment"])
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-pending-docs")
    def mark_pending_docs(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        _transition_case(case=case, to_status=NoveltyCase.Status.PENDING_DOCS, request=request, comment=data.validated_data["comment"])
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        comment = (data.validated_data.get("comment", "") or "").strip()
        if not comment:
            comment = "Aprobación automática"
            if _is_graduacion_case(case):
                comment = "Aprobación automática (graduación)"

        missing = [] if _is_graduacion_case(case) else _missing_required_documents(case)
        if missing:
            # Block approval; move to PENDING_DOCS to make the state explicit.
            auto_comment = f"{comment}\nFaltan soportes requeridos: {', '.join(missing)}"
            _transition_case(case=case, to_status=NoveltyCase.Status.PENDING_DOCS, request=request, comment=auto_comment)
            serialized = self.get_serializer(case).data
            return Response(
                {
                    "detail": "No se puede aprobar: faltan soportes obligatorios",
                    "missing_required_documents": missing,
                    "case": serialized,
                },
                status=status.HTTP_200_OK,
            )

        _transition_case(case=case, to_status=NoveltyCase.Status.APPROVED, request=request, comment=comment)
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        comment = data.validated_data.get("comment", "")
        if not comment:
            return Response({"detail": "Comentario requerido para rechazar"}, status=status.HTTP_400_BAD_REQUEST)

        _transition_case(case=case, to_status=NoveltyCase.Status.REJECTED, request=request, comment=comment)
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        _transition_case(case=case, to_status=NoveltyCase.Status.CLOSED, request=request, comment=data.validated_data["comment"])
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="execute")
    def execute(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _ExecuteInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        comment = data.validated_data.get("comment", "")
        idempotency_key = (data.validated_data.get("idempotency_key") or "").strip() or None

        try:
            result = execute_case(
                case_id=case.pk,
                actor=request.user,
                comment=comment,
                ip_address=_client_ip(request),
                idempotency_key=idempotency_key,
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        serialized_case = self.get_serializer(result.case).data
        return Response(
            {
                "case": serialized_case,
                "execution": serialized_case.get("execution"),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="revert")
    def revert(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _RevertInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        role = getattr(request.user, "role", "") if request.user and request.user.is_authenticated else ""
        if role not in {"SUPERADMIN", "ADMIN"}:
            return Response({"detail": "No autorizado para revertir"}, status=status.HTTP_403_FORBIDDEN)

        try:
            rev = revert_case(
                case_id=case.pk,
                actor=request.user,
                comment=data.validated_data["comment"],
                ip_address=_client_ip(request),
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Return updated case with embedded execution/reversion.
        serialized = self.get_serializer(self.get_object()).data
        return Response({"case": serialized, "reversion": serialized.get("reversion")}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="return-to-previous")
    def return_to_previous(self, request, pk=None):
        case: NoveltyCase = self.get_object()
        data = _TransitionInputSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)

        comment = data.validated_data.get("comment", "")
        if not comment:
            return Response({"detail": "Comentario requerido para devolver"}, status=status.HTTP_400_BAD_REQUEST)

        last = case.transitions.order_by("-created_at").first()
        if not last:
            return Response({"detail": "No hay historial de transiciones"}, status=status.HTTP_400_BAD_REQUEST)

        previous_status = last.from_status
        # Only allow returning within the workflow (avoid rolling back executed/closed here).
        if case.status in {NoveltyCase.Status.EXECUTED, NoveltyCase.Status.CLOSED}:
            return Response({"detail": "No se puede devolver un caso ejecutado/cerrado"}, status=status.HTTP_400_BAD_REQUEST)

        _transition_case(case=case, to_status=previous_status, request=request, comment=comment)
        return Response(self.get_serializer(case).data, status=status.HTTP_200_OK)


class NoveltyCaseTransitionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NoveltyCaseTransition.objects.select_related("case", "actor").all()
    serializer_class = NoveltyCaseTransitionSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["case", "from_status", "to_status"]


class NoveltyRequiredDocumentRuleViewSet(viewsets.ModelViewSet):
    queryset = NoveltyRequiredDocumentRule.objects.select_related("novelty_type", "novelty_reason").all()
    serializer_class = NoveltyRequiredDocumentRuleSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["novelty_type", "novelty_reason", "is_required", "doc_type"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(_visible_by_role_q(user=self.request.user))


class NoveltyAttachmentViewSet(viewsets.ModelViewSet):
    queryset = NoveltyAttachment.objects.select_related("case", "uploaded_by").all()
    serializer_class = NoveltyAttachmentSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["case", "doc_type"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(_visible_by_role_q(user=self.request.user))


class CapacityBucketViewSet(viewsets.ModelViewSet):
    queryset = CapacityBucket.objects.select_related("campus", "grade", "academic_year").all()
    serializer_class = CapacityBucketSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["campus", "grade", "academic_year", "shift", "modality", "is_active"]


class GroupCapacityOverrideViewSet(viewsets.ModelViewSet):
    queryset = GroupCapacityOverride.objects.select_related("group").all()
    serializer_class = GroupCapacityOverrideSerializer
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["group", "is_active"]
