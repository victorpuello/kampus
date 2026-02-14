from decimal import Decimal
import html as html_lib
import re
from datetime import date

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from .models import Teacher, TeacherStatisticsAIAnalysis
from .serializers import TeacherSerializer
from .pagination import DirectorCompliancePagination
from core.permissions import KampusModelPermissions
from core.models import Institution
from users.permissions import IsOwnerOrAdmin, IsAdmin, IsAdministrativeStaff

from academic.models import (
    AcademicYear,
    Achievement,
    AchievementGrade,
    GradeSheet,
    Group,
    Period,
    TeacherAssignment,
)
from academic.promotion import PASSING_SCORE_DEFAULT, _compute_subject_final_for_enrollments
from academic.ai import AIService, AIConfigError, AIProviderError
from discipline.models import DisciplineCase
from students.models import Enrollment
from students.completion import compute_completion_for_students, aggregate_group_summary_for_student_ids

from reports.weasyprint_utils import PDF_BASE_CSS, weasyprint_url_fetcher


def _ai_analysis_to_pdf_html(text: str) -> str:
    """Render markdown-ish AI output into simple HTML.

    Supported:
    - **bold** -> <strong>
    - list lines starting with '-' or '*' -> <ul><li>
    - section title lines like 'RESUMEN EJECUTIVO' -> <div class='section-title'>
    """

    raw = (text or "").strip()
    if not raw:
        return ""

    def inline_format(s: str) -> str:
        escaped = html_lib.escape(s)
        escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        return escaped

    lines = raw.splitlines()
    html_parts: list[str] = []
    in_list = False
    para_buf: list[str] = []

    def flush_paragraph():
        nonlocal para_buf
        if not para_buf:
            return
        text_line = " ".join([p.strip() for p in para_buf if p.strip()])
        if text_line:
            html_parts.append(f"<p>{inline_format(text_line)}</p>")
        para_buf = []

    def close_list():
        nonlocal in_list
        if in_list:
            html_parts.append("</ul>")
            in_list = False

    title_re = re.compile(r"^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 \-—]{3,}$")

    for raw_line in lines:
        line = raw_line.rstrip("\r")
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            close_list()
            continue

        # Section titles
        if title_re.match(stripped) and not stripped.startswith(('-', '*')):
            flush_paragraph()
            close_list()
            html_parts.append(f"<div class=\"section-title\">{inline_format(stripped)}</div>")
            continue

        # Bullet list items
        m = re.match(r"^\s*([-*])\s+(.*)$", line)
        if m:
            flush_paragraph()
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            item_text = m.group(2).strip()
            html_parts.append(f"<li>{inline_format(item_text)}</li>")
            continue

        # Regular paragraph line
        close_list()
        para_buf.append(stripped)

    flush_paragraph()
    close_list()

    return "\n".join(html_parts)


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.select_related('user').all().order_by('user__last_name', 'user__first_name', 'user__id')
    serializer_class = TeacherSerializer
    permission_classes = [KampusModelPermissions]
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.action in ["list", "create", "destroy"]:
            return [IsAuthenticated(), IsAdmin()]
        if self.action in ["retrieve", "update", "partial_update"]:
            return [IsAuthenticated(), IsOwnerOrAdmin()]
        if self.action in ["me_statistics", "me_statistics_ai", "me_statistics_ai_pdf", "me_dashboard_summary"]:
            return [IsAuthenticated()]
        return super().get_permissions()

    def _pick_current_period_for_year(self, year: AcademicYear) -> Period | None:
        periods = list(Period.objects.filter(academic_year=year).order_by("start_date", "id"))
        if not periods:
            return None

        today = date.today()
        for period in periods:
            if period.start_date and period.end_date and period.start_date <= today <= period.end_date:
                return period

        for period in periods:
            if not bool(period.is_closed):
                return period

        return periods[-1]

    def _pick_next_period_for_year(self, year: AcademicYear, current_period: Period | None) -> Period | None:
        if current_period is None:
            return None
        periods = list(Period.objects.filter(academic_year=year).order_by("start_date", "id"))
        for period in periods:
            if int(period.id) == int(current_period.id):
                continue
            if period.start_date and current_period.start_date and period.start_date > current_period.start_date:
                return period
        return None

    def _compute_grade_sheets_pending(self, assignments_qs, period: Period | None) -> dict:
        assignments_total = assignments_qs.count()
        if period is None:
            return {
                "period": None,
                "pending": 0,
                "total_expected": int(assignments_total),
            }

        created = GradeSheet.objects.filter(
            teacher_assignment__in=assignments_qs,
            period=period,
        ).count()
        pending = max(0, int(assignments_total) - int(created))
        return {
            "period": {"id": int(period.id), "name": str(period.name)},
            "pending": int(pending),
            "total_expected": int(assignments_total),
        }

    @action(detail=False, methods=["get"], url_path="me/dashboard-summary")
    def me_dashboard_summary(self, request):
        user = request.user
        if getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo disponible para docentes."}, status=status.HTTP_403_FORBIDDEN)

        year_id_raw = request.query_params.get("year_id")
        period_id_raw = request.query_params.get("period_id")

        if year_id_raw not in (None, ""):
            try:
                year = AcademicYear.objects.get(pk=int(str(year_id_raw)))
            except Exception:
                return Response({"detail": "year_id inválido"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first() or AcademicYear.objects.order_by("-year").first()

        if year is None:
            return Response({"detail": "No hay años lectivos configurados."}, status=status.HTTP_400_BAD_REQUEST)

        if period_id_raw not in (None, ""):
            try:
                current_period = Period.objects.get(pk=int(str(period_id_raw)), academic_year=year)
            except Exception:
                return Response({"detail": "period_id inválido"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            current_period = self._pick_current_period_for_year(year)

        if current_period is None:
            return Response({"detail": "El año lectivo no tiene periodos."}, status=status.HTTP_400_BAD_REQUEST)

        next_period = self._pick_next_period_for_year(year, current_period)

        assignments_qs = TeacherAssignment.objects.filter(teacher=user, academic_year=year).select_related(
            "group",
            "group__grade",
            "academic_load",
            "academic_load__subject",
        )
        assignments_total = assignments_qs.count()

        assigned_group_ids = list(assignments_qs.values_list("group_id", flat=True).distinct())
        students_active = 0
        if assigned_group_ids:
            students_active = Enrollment.objects.filter(
                academic_year=year,
                status="ACTIVE",
                group_id__in=assigned_group_ids,
            ).count()

        grade_sheets_current_qs = GradeSheet.objects.filter(
            teacher_assignment__in=assignments_qs,
            period=current_period,
        )
        grade_sheets_published = grade_sheets_current_qs.filter(status=GradeSheet.STATUS_PUBLISHED).count()
        grade_sheets_created = grade_sheets_current_qs.count()
        grade_sheets_published_percent = int(round((grade_sheets_published / assignments_total) * 100)) if assignments_total > 0 else 0

        assignment_pairs = list(assignments_qs.values_list("group_id", "academic_load_id").distinct())
        achievements_q = Q()
        for group_id, academic_load_id in assignment_pairs:
            if group_id is None or academic_load_id is None:
                continue
            achievements_q |= Q(group_id=group_id, academic_load_id=academic_load_id)

        planning_achievements_qs = Achievement.objects.filter(period=current_period)
        if achievements_q:
            planning_achievements_qs = planning_achievements_qs.filter(achievements_q)
        else:
            planning_achievements_qs = planning_achievements_qs.none()

        pairs_with_planning = set(
            planning_achievements_qs.values_list("group_id", "academic_load_id").distinct()
        )
        assignments_with_planning = 0
        for pair in assignment_pairs:
            if pair in pairs_with_planning:
                assignments_with_planning += 1
        planning_completion_percent = int(round((assignments_with_planning / assignments_total) * 100)) if assignments_total > 0 else 0

        achievement_group_ids = list(planning_achievements_qs.values_list("group_id", flat=True).distinct())
        enrollment_counts_by_group: dict[int, int] = {}
        if achievement_group_ids:
            for row in (
                Enrollment.objects.filter(
                    academic_year=year,
                    status="ACTIVE",
                    group_id__in=achievement_group_ids,
                )
                .values("group_id")
                .annotate(c=models.Count("id"))
            ):
                gid = int(row["group_id"])
                enrollment_counts_by_group[gid] = int(row["c"])

        gradebook_cells_expected = 0
        for gid in planning_achievements_qs.values_list("group_id", flat=True):
            if gid is None:
                continue
            gradebook_cells_expected += enrollment_counts_by_group.get(int(gid), 0)

        gradebook_cells_filled = AchievementGrade.objects.filter(
            achievement__in=planning_achievements_qs,
            enrollment__academic_year=year,
            enrollment__status="ACTIVE",
            score__isnull=False,
        ).count()
        gradebook_completion_percent = int(round((gradebook_cells_filled / gradebook_cells_expected) * 100)) if gradebook_cells_expected > 0 else 0

        active_year_for_director = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
        directed_groups_qs = Group.objects.filter(director=user)
        if active_year_for_director is not None:
            directed_groups_qs = directed_groups_qs.filter(academic_year=active_year_for_director)

        directed_group_ids = list(directed_groups_qs.values_list("id", flat=True))
        director_student_ids = []
        if directed_group_ids:
            director_student_ids = list(
                Enrollment.objects.filter(
                    status="ACTIVE",
                    group_id__in=directed_group_ids,
                )
                .values_list("student_id", flat=True)
                .distinct()
            )

        student_records_widget = {
            "enabled": bool(directed_group_ids),
            "students_total": 0,
            "students_computable": 0,
            "complete_100_count": 0,
            "avg_percent": None,
            "traffic_light": "grey",
        }

        at_risk_students = 0
        original_get = request._request.GET
        try:
            new_get = original_get.copy()
            new_get["year_id"] = str(year.id)
            new_get["period_id"] = str(current_period.id)
            request._request.GET = new_get
            stats_response = self.me_statistics(request)

            if getattr(stats_response, "status_code", None) == 200 and isinstance(stats_response.data, dict):
                risk = (((stats_response.data.get("director") or {}).get("performance") or {}).get("risk_summary") or {})
                at_risk_students = int(risk.get("at_risk") or 0)
        except Exception:
            at_risk_students = 0
        finally:
            request._request.GET = original_get

        if director_student_ids:
            completion_by_id, _summary = compute_completion_for_students([int(sid) for sid in director_student_ids])
            scoped = aggregate_group_summary_for_student_ids(completion_by_id, [int(sid) for sid in director_student_ids])
            student_records_widget = {
                "enabled": True,
                "students_total": int(scoped.get("students_total") or 0),
                "students_computable": int(scoped.get("students_computable") or 0),
                "complete_100_count": int(scoped.get("complete_100_count") or 0),
                "avg_percent": scoped.get("avg_percent"),
                "traffic_light": str(scoped.get("traffic_light") or "grey"),
            }

        payload = {
            "academic_year": {
                "id": int(year.id),
                "year": int(year.year),
                "status": str(year.status),
            },
            "periods": {
                "current": {"id": int(current_period.id), "name": str(current_period.name)} if current_period else None,
                "next": {"id": int(next_period.id), "name": str(next_period.name)} if next_period else None,
            },
            "widgets": {
                "performance": {
                    "students_active": int(students_active),
                    "gradebook_completion_percent": int(gradebook_completion_percent),
                    "grade_sheets_published_percent": int(grade_sheets_published_percent),
                    "at_risk_students": int(at_risk_students),
                },
                "planning": {
                    "assignments_total": int(assignments_total),
                    "assignments_with_planning": int(assignments_with_planning),
                    "completion_percent": int(planning_completion_percent),
                    "period": {"id": int(current_period.id), "name": str(current_period.name)} if current_period else None,
                },
                "student_records": student_records_widget,
                "grade_sheets": {
                    "current": self._compute_grade_sheets_pending(assignments_qs, current_period),
                    "next": self._compute_grade_sheets_pending(assignments_qs, next_period),
                },
            },
        }

        return Response(payload)

    def _build_ai_group_context(self, stats_payload: dict) -> dict:
        subject = (stats_payload or {}).get("subject_teacher") or {}
        director = (stats_payload or {}).get("director") or {}
        performance = (director or {}).get("performance") or {}
        scope = (performance or {}).get("scope") or {}
        group_id = scope.get("group_id")

        # Subject-teacher completion
        gs = subject.get("grade_sheets") or {}
        gb = subject.get("gradebook_cells") or {}
        gs_expected = int(gs.get("expected") or 0)
        gs_published = int(gs.get("published") or 0)
        gb_expected = int(gb.get("expected") or 0)
        gb_filled = int(gb.get("filled") or 0)

        # Director: pick group record (if selected) to include discipline context.
        group_ctx = None
        for g in (director.get("groups") or []):
            if group_id is None or int(g.get("group_id") or 0) == int(group_id):
                group_ctx = {
                    "group_id": g.get("group_id"),
                    "group_name": g.get("group_name"),
                    "grade_name": g.get("grade_name"),
                    "students_active": g.get("students_active"),
                    "discipline_cases_total": g.get("discipline_cases_total"),
                    "discipline_cases_open": g.get("discipline_cases_open"),
                }
                break

        risk_summary = performance.get("risk_summary") or {}

        # Aggregate completion across subjects (director performance)
        perf_subjects = performance.get("subjects_by_average") or []
        perf_cells_expected = 0
        perf_cells_filled = 0
        for s in perf_subjects:
            c = (s or {}).get("gradebook_cells") or {}
            perf_cells_expected += int(c.get("expected") or 0)
            perf_cells_filled += int(c.get("filled") or 0)

        # Rankings (aggregated only; no student names)
        top_avg = []
        for s in (performance.get("subjects_by_average") or [])[:5]:
            top_avg.append(
                {
                    "area": s.get("area_name") or "",
                    "subject": s.get("subject_name") or "",
                    "average": s.get("average"),
                    "failure_rate": s.get("failure_rate"),
                }
            )

        top_fail = []
        for s in (performance.get("subjects_by_failure_rate") or [])[:5]:
            top_fail.append(
                {
                    "area": s.get("area_name") or "",
                    "subject": s.get("subject_name") or "",
                    "average": s.get("average"),
                    "failure_rate": s.get("failure_rate"),
                }
            )

        period = (stats_payload or {}).get("period") or {}
        year = (stats_payload or {}).get("academic_year") or {}

        return {
            "scope": {
                "academic_year": year,
                "period": period,
                "director_mode": scope.get("director_mode"),
                "director_group_id": scope.get("group_id"),
                "passing_score": scope.get("passing_score"),
            },
            "group": group_ctx,
            "completion": {
                "subject_teacher": {
                    "grade_sheets": {"expected": gs_expected, "published": gs_published},
                    "gradebook_cells": {"expected": gb_expected, "filled": gb_filled},
                },
                "director": {
                    "gradebook_cells": {"expected": perf_cells_expected, "filled": perf_cells_filled},
                },
            },
            "risk": {
                "students_total": risk_summary.get("students_total"),
                "at_risk": risk_summary.get("at_risk"),
                "ok": risk_summary.get("ok"),
            },
            "subjects": {"best_by_average": top_avg, "worst_by_failure_rate": top_fail},
            "notes": [
                "Las métricas dependen del diligenciamiento de calificaciones (cobertura).",
                "En riesgo = promedio < umbral SIEE o >=1 asignatura perdida.",
            ],
        }

    def _sanitize_ai_analysis_text(self, text: str) -> str:
        t = (text or "").strip()
        if not t:
            return ""

        # Remove common greeting/cover-letter intros if the model includes them.
        t = re.sub(r"^\s*Estimad[oa][^\n]*\n+", "", t, flags=re.IGNORECASE)
        t = re.sub(r"^\s*A\s+continuaci[oó]n[^\n]*\n+", "", t, flags=re.IGNORECASE)

        forbidden = re.compile(
            r"estimado\s+docente|a\s+continuaci[oó]n,\s+presento\s+una\s+interpretaci[oó]n|interpretar\s+este\s+an[aá]lisis\s+con\s+precauci[oó]n|m[eé]tricas\s+definitivas",
            flags=re.IGNORECASE,
        )

        parts = re.split(r"\n\s*\n", t)
        parts = [p for p in parts if not forbidden.search(p)]
        return "\n\n".join(parts).strip()

    def _get_or_generate_ai_analysis(self, request, stats_payload: dict) -> tuple[str, bool, TeacherStatisticsAIAnalysis | None]:
        """Returns (analysis_text, cached, obj)."""
        user = request.user
        refresh_raw = request.query_params.get("refresh")
        refresh = str(refresh_raw or "").strip().lower() in ("1", "true", "yes")

        director = (stats_payload or {}).get("director") or {}
        performance = (director or {}).get("performance") or {}
        scope = (performance or {}).get("scope") or {}
        year = (stats_payload or {}).get("academic_year") or {}
        period = (stats_payload or {}).get("period") or {}

        year_id = year.get("id")
        period_id = period.get("id")
        director_mode = str(scope.get("director_mode") or "period")
        group_id = scope.get("group_id")
        group_key = int(group_id) if group_id not in (None, "") else 0
        passing_score_str = str(scope.get("passing_score") or f"{Decimal(PASSING_SCORE_DEFAULT):.2f}")
        try:
            passing_score = Decimal(passing_score_str)
        except Exception:
            passing_score = Decimal(PASSING_SCORE_DEFAULT)

        if not year_id or not period_id:
            # Should not happen if stats endpoint is healthy.
            raise AIProviderError("No se pudo determinar año/periodo para el análisis.")

        existing = (
            TeacherStatisticsAIAnalysis.objects.filter(
                user=user,
                academic_year_id=int(year_id),
                period_id=int(period_id),
                director_mode=director_mode,
                director_group_id=group_key,
                passing_score=passing_score,
            )
            .order_by("-updated_at")
            .first()
        )

        if existing and not refresh:
            cleaned = self._sanitize_ai_analysis_text(existing.analysis)
            if cleaned and cleaned != (existing.analysis or ""):
                existing.analysis = cleaned
                existing.save(update_fields=["analysis", "updated_at"])
            return cleaned or (existing.analysis or ""), True, existing

        svc = AIService()
        context = self._build_ai_group_context(stats_payload)
        analysis = self._sanitize_ai_analysis_text(svc.analyze_group_state(context))

        obj, _created = TeacherStatisticsAIAnalysis.objects.update_or_create(
            user=user,
            academic_year_id=int(year_id),
            period_id=int(period_id),
            director_mode=director_mode,
            director_group_id=group_key,
            passing_score=passing_score,
            defaults={"analysis": analysis, "context": context},
        )

        return analysis, False, obj

    @action(detail=False, methods=["get"], url_path="me/statistics/ai")
    def me_statistics_ai(self, request):
        user = request.user
        if getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo disponible para docentes."}, status=status.HTTP_403_FORBIDDEN)

        # Reuse the existing statistics computation and validation.
        base_resp = self.me_statistics(request)
        if getattr(base_resp, "status_code", 500) != 200:
            return base_resp

        stats_payload = getattr(base_resp, "data", None) or {}

        try:
            analysis, cached, obj = self._get_or_generate_ai_analysis(request, stats_payload)
            updated_at = getattr(obj, "updated_at", None)
            return Response(
                {
                    "analysis": analysis,
                    "cached": bool(cached),
                    "updated_at": updated_at.isoformat() if updated_at else None,
                },
                status=status.HTTP_200_OK,
            )
        except AIConfigError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except AIProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=False, methods=["get"], url_path="me/statistics/ai/pdf")
    def me_statistics_ai_pdf(self, request):
        user = request.user
        if getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo disponible para docentes."}, status=status.HTTP_403_FORBIDDEN)

        async_requested = (request.query_params.get("async") or "").strip().lower() in {"1", "true", "yes"}

        base_resp = self.me_statistics(request)
        if getattr(base_resp, "status_code", 500) != 200:
            return base_resp

        stats_payload = getattr(base_resp, "data", None) or {}
        try:
            analysis, _cached, _obj = self._get_or_generate_ai_analysis(request, stats_payload)
        except AIConfigError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except AIProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        year = (stats_payload or {}).get("academic_year") or {}
        period = (stats_payload or {}).get("period") or {}
        year_label = str(year.get("year") or "")
        period_label = str(period.get("name") or "")

        director = (stats_payload or {}).get("director") or {}
        performance = (director or {}).get("performance") or {}
        scope = (performance or {}).get("scope") or {}
        group_id = scope.get("group_id")

        group_name = "Todos"
        grade_name = ""
        if group_id not in (None, ""):
            try:
                gid = int(str(group_id))
                for g in (director.get("groups") or []):
                    if int(g.get("group_id") or 0) == gid:
                        group_name = str(g.get("group_name") or "")
                        grade_name = str(g.get("grade_name") or "")
                        break
            except Exception:
                pass

        institution = Institution.objects.first() or Institution(name="")
        teacher_name = ""
        try:
            teacher_name = str(getattr(request.user, "get_full_name", lambda: "")() or "")
        except Exception:
            teacher_name = ""

        analysis_html = _ai_analysis_to_pdf_html(analysis or "")

        if async_requested:
            from datetime import timedelta  # noqa: PLC0415
            from django.utils import timezone  # noqa: PLC0415
            from reports.models import ReportJob  # noqa: PLC0415
            from reports.serializers import ReportJobSerializer  # noqa: PLC0415
            from reports.tasks import generate_report_job_pdf  # noqa: PLC0415

            ttl_hours = int(getattr(settings, "REPORT_JOBS_TTL_HOURS", 24))
            expires_at = timezone.now() + timedelta(hours=ttl_hours)

            job = ReportJob.objects.create(
                created_by=request.user,
                report_type=ReportJob.ReportType.TEACHER_STATISTICS_AI,
                params={
                    "year_name": year_label,
                    "period_name": period_label,
                    "grade_name": grade_name,
                    "group_name": group_name,
                    "report_date": date.today().isoformat(),
                    "teacher_name": teacher_name,
                    "analysis_html": analysis_html,
                },
                expires_at=expires_at,
            )
            generate_report_job_pdf.delay(job.id)
            out = ReportJobSerializer(job, context={"request": request}).data
            return Response(out, status=status.HTTP_202_ACCEPTED)

        html = render_to_string(
            "teachers/reports/teacher_statistics_ai_pdf.html",
            {
                "institution": institution,
                "year_name": year_label,
                "period_name": period_label,
                "grade_name": grade_name,
                "group_name": group_name,
                "report_date": date.today().isoformat(),
                "teacher_name": teacher_name,
                "analysis_html": analysis_html,
            },
        )

        try:
            from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

            pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        except WeasyPrintUnavailableError as e:
            payload = {"detail": str(e)}
            if getattr(settings, "DEBUG", False):
                import traceback  # noqa: PLC0415

                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            return Response({"detail": "No se pudo generar el PDF."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not pdf_bytes:
            return Response({"detail": "No se pudo generar el PDF."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        filename = f"analisis_ia_{year_label}_{period_label}.pdf".replace(" ", "_")
        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        resp["Deprecation"] = "true"
        sunset = getattr(settings, "REPORTS_SYNC_SUNSET_DATE", "2026-06-30")
        resp["Sunset"] = str(sunset)
        resp["Link"] = '</api/reports/jobs/>; rel="alternate"'
        return resp

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['year_id'] = self.request.query_params.get('year_id')
        return context

    @action(
        detail=False,
        methods=["get"],
        url_path="director-compliance",
        permission_classes=[IsAuthenticated, IsAdministrativeStaff],
    )
    def director_compliance(self, request):
        """Admin monitoring: profile completion by directed group.

        Returns one row per directed group in the active academic year.
        """

        active_year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first() or AcademicYear.objects.order_by("-year").first()
        if active_year is None:
            return Response({"detail": "No hay años lectivos configurados."}, status=status.HTTP_400_BAD_REQUEST)

        director_id_raw = request.query_params.get("director_id")
        group_id_raw = request.query_params.get("group_id")
        search_raw = request.query_params.get("search")

        groups_qs = (
            Group.objects.select_related("grade", "campus", "director")
            .filter(academic_year=active_year, director__isnull=False)
            .order_by("grade__name", "name", "id")
        )

        if director_id_raw not in (None, ""):
            try:
                groups_qs = groups_qs.filter(director_id=int(str(director_id_raw)))
            except Exception:
                return Response({"detail": "director_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        if group_id_raw not in (None, ""):
            try:
                groups_qs = groups_qs.filter(id=int(str(group_id_raw)))
            except Exception:
                return Response({"detail": "group_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        q = (str(search_raw or "")).strip()
        if q:
            groups_qs = groups_qs.filter(
                Q(name__icontains=q)
                | Q(grade__name__icontains=q)
                | Q(campus__name__icontains=q)
                | Q(director__email__icontains=q)
                | Q(director__first_name__icontains=q)
                | Q(director__last_name__icontains=q)
            )

        groups = list(groups_qs)
        group_ids = [int(g.id) for g in groups]

        group_student_ids: dict[int, list[int]] = {gid: [] for gid in group_ids}
        all_student_ids: set[int] = set()

        if group_ids:
            for gid, sid in (
                Enrollment.objects.filter(
                    academic_year=active_year,
                    status="ACTIVE",
                    group_id__in=group_ids,
                )
                .values_list("group_id", "student_id")
                .iterator()
            ):
                gid_int = int(gid)
                sid_int = int(sid)
                group_student_ids.setdefault(gid_int, []).append(sid_int)
                all_student_ids.add(sid_int)

        completion_by_id: dict[int, dict] = {}
        if all_student_ids:
            completion_by_id, _group_summary_unused = compute_completion_for_students(list(all_student_ids))

        director_user_ids = [int(getattr(getattr(g, "director", None), "id", 0) or 0) for g in groups]
        director_user_ids = [uid for uid in director_user_ids if uid]
        teacher_by_user_id: dict[int, Teacher] = {}
        if director_user_ids:
            for t in Teacher.objects.filter(user_id__in=director_user_ids).only("user_id", "photo", "photo_thumb"):
                teacher_by_user_id[int(t.user_id)] = t

        def _file_url_or_none(f):
            if not f:
                return None
            try:
                url = f.url
            except Exception:
                return None
            try:
                return request.build_absolute_uri(url)
            except Exception:
                return url

        results: list[dict] = []
        group_avgs: list[int] = []
        for g in groups:
            gid = int(g.id)
            student_ids = group_student_ids.get(gid, [])

            if student_ids:
                summary = aggregate_group_summary_for_student_ids(completion_by_id, student_ids)
            else:
                summary = {
                    "avg_percent": None,
                    "traffic_light": "grey",
                    "students_total": 0,
                    "students_computable": 0,
                    "students_missing_enrollment": 0,
                    "complete_100_count": 0,
                }

            avg = summary.get("avg_percent")
            if isinstance(avg, int):
                group_avgs.append(avg)

            director = getattr(g, "director", None)
            director_teacher = teacher_by_user_id.get(int(getattr(director, "id", 0) or 0))
            director_payload = {
                "id": int(getattr(director, "id", 0) or 0),
                "full_name": (getattr(director, "get_full_name", lambda: "")() or "").strip(),
                "email": str(getattr(director, "email", "") or ""),
                "photo_thumb": _file_url_or_none(getattr(director_teacher, "photo_thumb", None)),
                "photo": _file_url_or_none(getattr(director_teacher, "photo", None)),
            }

            results.append(
                {
                    "group": {
                        "id": gid,
                        "name": str(getattr(g, "name", "") or ""),
                        "grade_id": int(getattr(g, "grade_id", 0) or 0),
                        "grade_name": str(getattr(getattr(g, "grade", None), "name", "") or ""),
                        "campus_id": int(getattr(g, "campus_id", 0) or 0) if getattr(g, "campus_id", None) else None,
                        "campus_name": str(getattr(getattr(g, "campus", None), "name", "") or "") if getattr(g, "campus_id", None) else None,
                        "shift": str(getattr(g, "shift", "") or ""),
                    },
                    "director": director_payload,
                    "summary": summary,
                }
            )

        overall_avg = int(round(sum(group_avgs) / len(group_avgs))) if group_avgs else None
        overall_light = "grey"
        if overall_avg is not None:
            if overall_avg >= 90:
                overall_light = "green"
            elif overall_avg >= 70:
                overall_light = "yellow"
            else:
                overall_light = "red"

        counts_by_light = {"green": 0, "yellow": 0, "red": 0, "grey": 0}
        for r in results:
            light = str(((r.get("summary") or {}).get("traffic_light") or "grey")).lower()
            if light == "green":
                counts_by_light["green"] += 1
            elif light == "yellow":
                counts_by_light["yellow"] += 1
            elif light == "red":
                counts_by_light["red"] += 1
            else:
                counts_by_light["grey"] += 1

        paginator = DirectorCompliancePagination()
        page = paginator.paginate_queryset(results, request, view=self)
        resp = paginator.get_paginated_response(page)
        resp.data["academic_year"] = {"id": int(active_year.id), "year": int(active_year.year), "status": str(active_year.status)}
        resp.data["totals"] = {
            "groups_total": len(results),
            "groups_with_students": sum(1 for r in results if (r.get("summary") or {}).get("students_total", 0) > 0),
            "avg_percent": overall_avg,
            "traffic_light": overall_light,
        }
        resp.data["counts_by_light"] = counts_by_light
        return resp

    @action(detail=False, methods=["get"], url_path="me/statistics")
    def me_statistics(self, request):
        user = request.user
        if getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo disponible para docentes."}, status=status.HTTP_403_FORBIDDEN)

        year_id_raw = request.query_params.get("year_id")
        period_id_raw = request.query_params.get("period_id")

        year: AcademicYear | None = None
        if year_id_raw not in (None, ""):
            try:
                year = AcademicYear.objects.get(pk=int(str(year_id_raw)))
            except Exception:
                return Response({"detail": "year_id inválido"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first() or AcademicYear.objects.order_by("-year").first()

        if year is None:
            return Response({"detail": "No hay años lectivos configurados."}, status=status.HTTP_400_BAD_REQUEST)

        period: Period | None = None
        if period_id_raw not in (None, ""):
            try:
                period = Period.objects.get(pk=int(str(period_id_raw)))
            except Exception:
                return Response({"detail": "period_id inválido"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            period = Period.objects.filter(academic_year=year).order_by("start_date").last()

        if period is None:
            return Response({"detail": "El año lectivo no tiene periodos."}, status=status.HTTP_400_BAD_REQUEST)

        if int(period.academic_year_id) != int(year.id):
            return Response({"detail": "El periodo no corresponde al año lectivo."}, status=status.HTTP_400_BAD_REQUEST)

        assignments_qs = TeacherAssignment.objects.filter(teacher=user, academic_year=year).select_related(
            "group",
            "group__grade",
            "academic_load",
            "academic_load__subject",
        )
        assignments_count = assignments_qs.count()
        groups_count = assignments_qs.values("group_id").distinct().count()
        subjects_count = assignments_qs.values("academic_load__subject_id").distinct().count()

        assigned_group_ids = list(assignments_qs.values_list("group_id", flat=True).distinct())
        students_count = 0
        if assigned_group_ids:
            students_count = Enrollment.objects.filter(
                academic_year=year,
                status="ACTIVE",
                group_id__in=assigned_group_ids,
            ).count()

        grade_sheets_qs = GradeSheet.objects.filter(
            teacher_assignment__in=assignments_qs,
            period=period,
        )
        grade_sheets_created = grade_sheets_qs.count()
        grade_sheets_published = grade_sheets_qs.filter(status=GradeSheet.STATUS_PUBLISHED).count()
        grade_sheets_draft = grade_sheets_qs.filter(status=GradeSheet.STATUS_DRAFT).count()
        grade_sheets_missing = max(0, assignments_count - grade_sheets_created)

        # Gradebook completion by cells (filled scores) for this period.
        assignment_pairs = list(
            assignments_qs.values_list("group_id", "academic_load_id").distinct()
        )
        achievements_q = Q()
        for group_id, academic_load_id in assignment_pairs:
            if group_id is None or academic_load_id is None:
                continue
            achievements_q |= Q(group_id=group_id, academic_load_id=academic_load_id)

        achievements_qs = Achievement.objects.filter(period=period)
        if achievements_q:
            achievements_qs = achievements_qs.filter(achievements_q)
        else:
            achievements_qs = achievements_qs.none()

        achievement_group_ids = list(
            achievements_qs.values_list("group_id", flat=True).distinct()
        )
        enrollment_counts_by_group: dict[int, int] = {}
        if achievement_group_ids:
            for row in (
                Enrollment.objects.filter(
                    academic_year=year,
                    status="ACTIVE",
                    group_id__in=achievement_group_ids,
                )
                .values("group_id")
                .annotate(c=models.Count("id"))
            ):
                gid = int(row["group_id"])
                enrollment_counts_by_group[gid] = int(row["c"])

        achievement_ids = list(achievements_qs.values_list("id", flat=True))
        gradebook_cells_expected = 0
        if achievement_ids:
            for gid in achievements_qs.values_list("group_id", flat=True):
                if gid is None:
                    continue
                gradebook_cells_expected += enrollment_counts_by_group.get(int(gid), 0)

        gradebook_cells_filled = 0
        if achievement_ids:
            gradebook_cells_filled = AchievementGrade.objects.filter(
                achievement_id__in=achievement_ids,
                enrollment__academic_year=year,
                enrollment__status="ACTIVE",
                enrollment__group_id__in=achievement_group_ids,
                score__isnull=False,
            ).count()

        directed_groups_qs = Group.objects.filter(director=user, academic_year=year).select_related("grade")
        directed_groups = list(directed_groups_qs)

        director_mode = str(request.query_params.get("director_mode") or "period").strip().lower()
        if director_mode not in ("period", "accumulated"):
            return Response({"detail": "director_mode inválido"}, status=status.HTTP_400_BAD_REQUEST)

        director_group_id_raw = request.query_params.get("director_group_id")
        selected_director_group_id: int | None = None
        if director_group_id_raw not in (None, ""):
            try:
                selected_director_group_id = int(str(director_group_id_raw))
            except Exception:
                return Response({"detail": "director_group_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        director_subject_id_raw = request.query_params.get("director_subject_id")
        selected_director_subject_id: int | None = None
        if director_subject_id_raw not in (None, ""):
            try:
                selected_director_subject_id = int(str(director_subject_id_raw))
            except Exception:
                return Response({"detail": "director_subject_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        passing_score_raw = request.query_params.get("passing_score")
        passing_score = PASSING_SCORE_DEFAULT
        if passing_score_raw not in (None, ""):
            try:
                passing_score = Decimal(str(passing_score_raw))
            except Exception:
                return Response({"detail": "passing_score inválido"}, status=status.HTTP_400_BAD_REQUEST)

        director_groups_payload = []
        director_students_total = 0
        director_cases_total = 0
        director_cases_open_total = 0

        for g in directed_groups:
            group_students = Enrollment.objects.filter(
                academic_year=year,
                status="ACTIVE",
                group=g,
            ).count()

            cases_qs = DisciplineCase.objects.filter(enrollment__academic_year=year, enrollment__group=g)
            cases_total = cases_qs.count()
            cases_open = cases_qs.filter(status=DisciplineCase.Status.OPEN).count()

            director_students_total += group_students
            director_cases_total += cases_total
            director_cases_open_total += cases_open

            director_groups_payload.append(
                {
                    "group_id": int(g.id),
                    "group_name": str(getattr(g, "name", "")),
                    "grade_id": int(g.grade_id),
                    "grade_name": str(getattr(g.grade, "name", "")),
                    "students_active": int(group_students),
                    "discipline_cases_total": int(cases_total),
                    "discipline_cases_open": int(cases_open),
                }
            )

        director_groups_payload.sort(key=lambda x: (x["grade_name"], x["group_name"]))

        # Director performance analytics (academic): subject rankings + student top/risk.
        # Important: grade computations coalesce NULL scores to DEFAULT_EMPTY_SCORE in gradebook logic.
        # We therefore include completion (filled vs expected cells) to interpret results.
        directed_group_ids = [int(g.id) for g in directed_groups]

        performance_group_ids: list[int] = []
        if selected_director_group_id is not None:
            if selected_director_group_id not in directed_group_ids:
                return Response({"detail": "El grupo no pertenece a tus grupos dirigidos."}, status=status.HTTP_400_BAD_REQUEST)
            performance_group_ids = [selected_director_group_id]
        else:
            performance_group_ids = directed_group_ids

        performance_payload = {
            "scope": {
                "director_mode": director_mode,
                "group_id": selected_director_group_id,
                "subject_id": selected_director_subject_id,
                "passing_score": f"{Decimal(passing_score):.2f}",
            },
            "subjects_by_average": [],
            "subjects_by_failure_rate": [],
            "top_students": [],
            "at_risk_students": [],
            "risk_summary": {"students_total": 0, "at_risk": 0, "ok": 0},
            "subject_detail": None,
        }

        if directed_group_ids and performance_group_ids:
            if director_mode == "accumulated":
                year_periods = list(
                    Period.objects.filter(academic_year=year)
                    .only("id", "start_date")
                    .order_by("start_date", "id")
                )
                period_ids: list[int] = []
                for p in year_periods:
                    period_ids.append(int(p.id))
                    if int(p.id) == int(period.id):
                        break
                periods_to_use = list(Period.objects.filter(id__in=period_ids).order_by("start_date", "id"))
            else:
                periods_to_use = [period]

            enrollments_qs = (
                Enrollment.objects.filter(
                    academic_year=year,
                    status="ACTIVE",
                    group_id__in=performance_group_ids,
                )
                .select_related("student__user", "group", "group__grade")
                .only(
                    "id",
                    "group_id",
                    "student_id",
                    "student__user__first_name",
                    "student__user__last_name",
                    "group__name",
                    "group__grade__name",
                )
            )
            enrollments = list(enrollments_qs)
            enrollment_ids = [int(e.id) for e in enrollments]

            enrollment_ids_by_group: dict[int, list[int]] = {}
            for e in enrollments:
                gid = int(e.group_id) if e.group_id is not None else 0
                enrollment_ids_by_group.setdefault(gid, []).append(int(e.id))

            assignments_for_director = list(
                TeacherAssignment.objects.filter(academic_year=year, group_id__in=performance_group_ids)
                .select_related("group", "academic_load__subject__area")
                .only(
                    "id",
                    "group_id",
                    "academic_year_id",
                    "academic_load_id",
                    "academic_load__subject_id",
                    "academic_load__subject__name",
                    "academic_load__subject__area__name",
                )
            )

            from collections import defaultdict

            subject_name: dict[int, str] = {}
            subject_area: dict[int, str] = {}

            sum_by_enrollment_subject: dict[tuple[int, int], Decimal] = defaultdict(lambda: Decimal("0.00"))
            count_by_enrollment_subject: dict[tuple[int, int], int] = defaultdict(int)

            # Completion tracking per subject (cells filled vs expected).
            cells_expected_by_subject: dict[int, int] = defaultdict(int)
            cells_filled_by_subject: dict[int, int] = defaultdict(int)

            for ta in assignments_for_director:
                if not ta.academic_load_id or not getattr(ta.academic_load, "subject_id", None):
                    continue

                subj_id = int(ta.academic_load.subject_id)
                subject_name[subj_id] = str(getattr(ta.academic_load.subject, "name", ""))
                subject_area[subj_id] = str(getattr(getattr(ta.academic_load.subject, "area", None), "name", ""))

                group_enrollment_ids = enrollment_ids_by_group.get(int(ta.group_id), [])
                if not group_enrollment_ids:
                    continue

                for p in periods_to_use:
                    finals = _compute_subject_final_for_enrollments(
                        teacher_assignment=ta,
                        period=p,
                        enrollment_ids=group_enrollment_ids,
                    )
                    for eid, score in finals.items():
                        key = (int(eid), subj_id)
                        sum_by_enrollment_subject[key] += Decimal(score)
                        count_by_enrollment_subject[key] += 1

                    # Completion: expected cells = achievements * active students; filled cells = non-null scores.
                    achievements = Achievement.objects.filter(academic_load=ta.academic_load, period=p)
                    group_specific = achievements.filter(group_id=int(ta.group_id))
                    if group_specific.exists():
                        achievement_ids = list(group_specific.values_list("id", flat=True))
                    else:
                        achievement_ids = list(achievements.filter(group__isnull=True).values_list("id", flat=True))

                    ach_count = len(achievement_ids)
                    if ach_count > 0:
                        cells_expected_by_subject[subj_id] += int(ach_count) * int(len(group_enrollment_ids))

                    gs = GradeSheet.objects.filter(teacher_assignment=ta, period=p).only("id").first()
                    if gs is not None and achievement_ids:
                        filled = AchievementGrade.objects.filter(
                            gradesheet_id=gs.id,
                            achievement_id__in=achievement_ids,
                            enrollment__academic_year=year,
                            enrollment__status="ACTIVE",
                            score__isnull=False,
                        ).count()
                        cells_filled_by_subject[subj_id] += int(filled)

            # Final per-enrollment per-subject average (period or accumulated).
            final_by_enrollment_subject: dict[tuple[int, int], Decimal] = {}
            for key, total in sum_by_enrollment_subject.items():
                count = count_by_enrollment_subject.get(key, 0)
                if count <= 0:
                    continue
                final_by_enrollment_subject[key] = (Decimal(total) / Decimal(count)).quantize(Decimal("0.01"))

            # Subject rankings.
            subjects_payload = []
            for subj_id in sorted(subject_name.keys()):
                scores: list[Decimal] = []
                failures = 0
                for eid in enrollment_ids:
                    s = final_by_enrollment_subject.get((int(eid), subj_id))
                    if s is None:
                        continue
                    scores.append(Decimal(s))
                    if Decimal(s) < Decimal(passing_score):
                        failures += 1

                if not scores:
                    continue

                avg = (sum(scores) / Decimal(len(scores))).quantize(Decimal("0.01"))
                failure_rate = (Decimal(failures) / Decimal(len(scores)) * Decimal("100.0")).quantize(Decimal("0.1"))

                subjects_payload.append(
                    {
                        "subject_id": int(subj_id),
                        "subject_name": str(subject_name.get(subj_id, "")),
                        "area_name": str(subject_area.get(subj_id, "")),
                        "students": int(len(scores)),
                        "average": f"{avg:.2f}",
                        "failure_rate": f"{failure_rate:.1f}",
                        "gradebook_cells": {
                            "expected": int(cells_expected_by_subject.get(subj_id, 0)),
                            "filled": int(cells_filled_by_subject.get(subj_id, 0)),
                        },
                    }
                )

            performance_payload["subjects_by_average"] = sorted(
                subjects_payload,
                key=lambda x: (
                    Decimal(str(x.get("average") or "0")),
                    int(x.get("students") or 0),
                    str(x.get("subject_name") or ""),
                ),
                reverse=True,
            )
            performance_payload["subjects_by_failure_rate"] = sorted(
                subjects_payload,
                key=lambda x: (
                    Decimal(str(x.get("failure_rate") or "0")),
                    int(x.get("students") or 0),
                    str(x.get("subject_name") or ""),
                ),
                reverse=True,
            )

            # Student rankings.
            scores_by_enrollment: dict[int, list[Decimal]] = defaultdict(list)
            for (enr_id, _subj_id), score in final_by_enrollment_subject.items():
                scores_by_enrollment[int(enr_id)].append(Decimal(score))

            per_student_rows = []
            for e in enrollments:
                eid = int(e.id)
                subj_scores = scores_by_enrollment.get(eid, [])
                if not subj_scores:
                    continue

                avg = (sum(subj_scores) / Decimal(len(subj_scores))).quantize(Decimal("0.01"))
                failed_subjects = sum(1 for s in subj_scores if Decimal(s) < Decimal(passing_score))

                student_name_val = ""
                try:
                    student_name_val = str(e.student.user.get_full_name())
                except Exception:
                    student_name_val = str(e.student)

                per_student_rows.append(
                    {
                        "enrollment_id": int(eid),
                        "student_id": int(e.student_id),
                        "student_name": student_name_val,
                        "group_id": int(e.group_id) if e.group_id else None,
                        "group_name": str(getattr(e.group, "name", "")) if getattr(e, "group", None) else "",
                        "grade_name": str(getattr(getattr(e.group, "grade", None), "name", "")) if getattr(e, "group", None) else "",
                        "average": f"{avg:.2f}",
                        "failed_subjects": int(failed_subjects),
                        "subjects_count": int(len(subj_scores)),
                    }
                )

            # Best students: higher average first, then more subjects, then fewer failed subjects.
            per_student_rows.sort(
                key=lambda r: (
                    -Decimal(str(r.get("average") or "0")),
                    -int(r.get("subjects_count") or 0),
                    int(r.get("failed_subjects") or 0),
                    str(r.get("student_name") or ""),
                )
            )
            performance_payload["top_students"] = per_student_rows[:10]

            at_risk = [
                r
                for r in per_student_rows
                if int(r.get("failed_subjects") or 0) > 0
                or Decimal(str(r.get("average") or "0")) < Decimal(passing_score)
            ]
            # Risk: more failed subjects first, then lower average.
            at_risk.sort(
                key=lambda r: (
                    -int(r.get("failed_subjects") or 0),
                    Decimal(str(r.get("average") or "0")),
                    str(r.get("student_name") or ""),
                )
            )
            performance_payload["at_risk_students"] = at_risk[:10]

            students_active = int(len(enrollments))
            students_evaluated = int(len(per_student_rows))
            students_without_data = max(0, students_active - students_evaluated)
            at_risk_total = int(len(at_risk))
            ok_total = max(0, students_evaluated - at_risk_total)

            # Backwards-compatible keys:
            # - students_total = evaluated students (with at least 1 computed subject score)
            performance_payload["risk_summary"] = {
                "students_active": students_active,
                "students_evaluated": students_evaluated,
                "students_without_data": students_without_data,
                "students_total": students_evaluated,
                "at_risk": at_risk_total,
                "ok": ok_total,
            }

            # Optional: detail by selected subject.
            if selected_director_subject_id is not None:
                subj_id = int(selected_director_subject_id)
                rows = []
                scores: list[Decimal] = []
                failures = 0

                for e in enrollments:
                    eid = int(e.id)
                    score = final_by_enrollment_subject.get((eid, subj_id))
                    if score is None:
                        continue

                    scores.append(Decimal(score))
                    failed = bool(Decimal(score) < Decimal(passing_score))
                    if failed:
                        failures += 1

                    try:
                        student_name_val = str(e.student.user.get_full_name())
                    except Exception:
                        student_name_val = str(e.student)

                    rows.append(
                        {
                            "enrollment_id": int(eid),
                            "student_id": int(e.student_id),
                            "student_name": student_name_val,
                            "group_id": int(e.group_id) if e.group_id else None,
                            "group_name": str(getattr(e.group, "name", "")) if getattr(e, "group", None) else "",
                            "grade_name": str(getattr(getattr(e.group, "grade", None), "name", "")) if getattr(e, "group", None) else "",
                            "score": f"{Decimal(score):.2f}",
                            "failed": bool(failed),
                        }
                    )

                if scores:
                    avg = (sum(scores) / Decimal(len(scores))).quantize(Decimal("0.01"))
                    failure_rate = (Decimal(failures) / Decimal(len(scores)) * Decimal("100.0")).quantize(Decimal("0.1"))

                    rows.sort(
                        key=lambda r: (
                            bool(r.get("failed")) is False,
                            Decimal(str(r.get("score") or "0")),
                            str(r.get("student_name") or ""),
                        )
                    )

                    performance_payload["subject_detail"] = {
                        "subject_id": int(subj_id),
                        "subject_name": str(subject_name.get(subj_id, "")),
                        "area_name": str(subject_area.get(subj_id, "")),
                        "students": int(len(scores)),
                        "average": f"{avg:.2f}",
                        "failure_rate": f"{failure_rate:.1f}",
                        "gradebook_cells": {
                            "expected": int(cells_expected_by_subject.get(subj_id, 0)),
                            "filled": int(cells_filled_by_subject.get(subj_id, 0)),
                        },
                        "students_rows": rows[:50],
                    }

        return Response(
            {
                "academic_year": {"id": int(year.id), "year": int(year.year), "status": str(year.status)},
                "period": {"id": int(period.id), "name": str(period.name), "is_closed": bool(period.is_closed)},
                "subject_teacher": {
                    "assignments": int(assignments_count),
                    "groups": int(groups_count),
                    "subjects": int(subjects_count),
                    "students_active": int(students_count),
                    "grade_sheets": {
                        "expected": int(assignments_count),
                        "created": int(grade_sheets_created),
                        "published": int(grade_sheets_published),
                        "draft": int(grade_sheets_draft),
                        "missing": int(grade_sheets_missing),
                    },
                    "gradebook_cells": {
                        "expected": int(gradebook_cells_expected),
                        "filled": int(gradebook_cells_filled),
                    },
                },
                "director": {
                    "groups": director_groups_payload,
                    "totals": {
                        "groups": int(len(directed_groups)),
                        "students_active": int(director_students_total),
                        "discipline_cases_total": int(director_cases_total),
                        "discipline_cases_open": int(director_cases_open_total),
                    },
                    "performance": performance_payload,
                },
            }
        )
