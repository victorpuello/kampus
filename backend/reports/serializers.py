from __future__ import annotations

from rest_framework import serializers

from academic.models import Period, TeacherAssignment
from students.models import Enrollment
from users.models import User

from .models import ReportJob


class ReportJobCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportJob
        fields = ["id", "report_type", "params"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        attrs = super().validate(attrs)

        report_type = attrs.get("report_type")
        params = attrs.get("params") or {}
        request = self.context.get("request")

        if report_type == ReportJob.ReportType.DUMMY:
            return attrs

        if request is None:
            raise serializers.ValidationError("Request context is required")

        user = request.user
        role = getattr(user, "role", None)

        if report_type == ReportJob.ReportType.ACADEMIC_PERIOD_ENROLLMENT:
            enrollment_id = params.get("enrollment_id")
            period_id = params.get("period_id")
            if not enrollment_id or not period_id:
                raise serializers.ValidationError({"params": "enrollment_id y period_id son requeridos"})

            enrollment = (
                Enrollment.objects.select_related(
                    "student",
                    "student__user",
                    "group",
                    "group__director",
                    "academic_year",
                )
                .filter(id=enrollment_id)
                .first()
            )
            if not enrollment:
                raise serializers.ValidationError({"params": "Enrollment no encontrado"})

            try:
                period = Period.objects.select_related("academic_year").get(id=period_id)
            except Period.DoesNotExist:
                raise serializers.ValidationError({"params": "Periodo no encontrado"})

            if period.academic_year_id != enrollment.academic_year_id:
                raise serializers.ValidationError({"params": "El periodo no corresponde al año lectivo de la matrícula."})

            is_admin_like = role in {User.ROLE_SUPERADMIN, User.ROLE_ADMIN, User.ROLE_COORDINATOR}
            is_group_director = (
                role == User.ROLE_TEACHER
                and enrollment.group_id
                and getattr(enrollment.group, "director_id", None) == getattr(user, "id", None)
            )
            if not (is_admin_like or is_group_director):
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            return attrs

        if report_type == ReportJob.ReportType.ACADEMIC_PERIOD_GROUP:
            group_id = params.get("group_id")
            period_id = params.get("period_id")
            if not group_id or not period_id:
                raise serializers.ValidationError({"params": "group_id y period_id son requeridos"})

            from academic.models import Group  # noqa: PLC0415

            group = Group.objects.select_related("academic_year", "director").filter(id=group_id).first()
            if not group:
                raise serializers.ValidationError({"params": "Grupo no encontrado"})

            try:
                period = Period.objects.select_related("academic_year").get(id=period_id)
            except Period.DoesNotExist:
                raise serializers.ValidationError({"params": "Periodo no encontrado"})

            if period.academic_year_id != group.academic_year_id:
                raise serializers.ValidationError({"params": "El periodo no corresponde al año lectivo del grupo."})

            is_admin_like = role in {User.ROLE_SUPERADMIN, User.ROLE_ADMIN, User.ROLE_COORDINATOR}
            if is_admin_like:
                return attrs

            if role == User.ROLE_TEACHER:
                teacher_id = getattr(user, "id", None)
                is_director = getattr(group, "director_id", None) == teacher_id
                is_assigned = (
                    TeacherAssignment.objects.filter(teacher_id=teacher_id, group_id=group.id).exists()
                    if teacher_id is not None
                    else False
                )
                if not (is_director or is_assigned):
                    raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})
            else:
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            return attrs

        if report_type == ReportJob.ReportType.DISCIPLINE_CASE_ACTA:
            case_id = params.get("case_id")
            if not case_id:
                raise serializers.ValidationError({"params": "case_id es requerido"})

            from discipline.models import DisciplineCase  # noqa: PLC0415
            from academic.models import AcademicYear, Group  # noqa: PLC0415

            qs = DisciplineCase.objects.all()

            if role == User.ROLE_TEACHER:
                active_year = AcademicYear.objects.filter(status="ACTIVE").first()
                directed_groups = Group.objects.filter(director=user)
                if active_year:
                    directed_groups = directed_groups.filter(academic_year=active_year)

                if active_year:
                    assigned_group_ids = set(
                        TeacherAssignment.objects.filter(teacher=user, academic_year=active_year).values_list(
                            "group_id", flat=True
                        )
                    )
                else:
                    assigned_group_ids = set(
                        TeacherAssignment.objects.filter(teacher=user).values_list("group_id", flat=True)
                    )

                allowed_group_ids = set(directed_groups.values_list("id", flat=True)) | assigned_group_ids
                if not allowed_group_ids:
                    raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})
                qs = qs.filter(enrollment__group_id__in=allowed_group_ids, enrollment__status="ACTIVE").distinct()
            elif role in {User.ROLE_SUPERADMIN, User.ROLE_ADMIN, User.ROLE_COORDINATOR}:
                qs = qs
            elif role == User.ROLE_PARENT:
                qs = qs.filter(student__family_members__user=user).distinct()
            else:
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            case = qs.filter(id=case_id).first()
            if not case:
                raise serializers.ValidationError({"params": "Caso no encontrado o no autorizado"})

            return attrs

        if report_type == ReportJob.ReportType.ATTENDANCE_MANUAL_SHEET:
            group_id = params.get("group_id")
            if not group_id:
                raise serializers.ValidationError({"params": "group_id es requerido"})

            from academic.models import Group  # noqa: PLC0415
            from attendance.reports import user_can_access_group  # noqa: PLC0415

            group = Group.objects.select_related("grade", "academic_year", "director").filter(id=group_id).first()
            if not group:
                raise serializers.ValidationError({"params": "Grupo no encontrado"})

            if not user_can_access_group(user, group):
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            cols = params.get("columns")
            if cols not in (None, ""):
                try:
                    cols_int = int(cols)
                except Exception:
                    raise serializers.ValidationError({"params": "columns inválido"})
                if cols_int < 1 or cols_int > 40:
                    raise serializers.ValidationError({"params": "columns debe estar entre 1 y 40"})

            return attrs

        if report_type == ReportJob.ReportType.ENROLLMENT_LIST:
            if role in {User.ROLE_TEACHER, User.ROLE_PARENT, User.ROLE_STUDENT}:
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            for key in ("year_id", "grade_id", "group_id"):
                val = params.get(key)
                if val in (None, ""):
                    continue
                try:
                    int(val)
                except Exception:
                    raise serializers.ValidationError({"params": f"{key} inválido"})

            return attrs

        if report_type == ReportJob.ReportType.GRADE_REPORT_SHEET:
            group_id = params.get("group_id")
            if not group_id:
                raise serializers.ValidationError({"params": "group_id es requerido"})

            from academic.models import Group  # noqa: PLC0415
            from academic.reports import user_can_access_group  # noqa: PLC0415

            group = Group.objects.select_related("grade", "academic_year", "director").filter(id=group_id).first()
            if not group:
                raise serializers.ValidationError({"params": "Grupo no encontrado"})

            # Only administrative staff or authorized teachers.
            admin_roles = {User.ROLE_SUPERADMIN, User.ROLE_ADMIN, User.ROLE_COORDINATOR, User.ROLE_SECRETARY}
            if role not in admin_roles and not user_can_access_group(user, group):
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            cols = params.get("columns")
            if cols not in (None, ""):
                try:
                    cols_int = int(cols)
                except Exception:
                    raise serializers.ValidationError({"params": "columns inválido"})
                if cols_int < 1 or cols_int > 12:
                    raise serializers.ValidationError({"params": "columns debe estar entre 1 y 12"})

            period_id = params.get("period_id")
            if period_id not in (None, ""):
                try:
                    period_id_int = int(period_id)
                except Exception:
                    raise serializers.ValidationError({"params": "period_id inválido"})
                try:
                    period = Period.objects.select_related("academic_year").get(id=period_id_int)
                except Period.DoesNotExist:
                    raise serializers.ValidationError({"params": "Periodo no encontrado"})
                if period.academic_year_id != group.academic_year_id:
                    raise serializers.ValidationError({"params": "El periodo no corresponde al año lectivo del grupo."})

            return attrs

        if report_type == ReportJob.ReportType.TEACHER_STATISTICS_AI:
            # Only teachers can create this report, and only for themselves.
            if role != User.ROLE_TEACHER:
                raise serializers.ValidationError({"detail": "Solo disponible para docentes."})

            # To keep the worker simple and safe, the API requires the pre-rendered analysis HTML
            # plus the metadata strings used in the template.
            required_keys = [
                "analysis_html",
                "year_name",
                "period_name",
                "group_name",
                "grade_name",
                "teacher_name",
                "report_date",
            ]
            missing = [k for k in required_keys if not (params.get(k) or "").strip()]
            if missing:
                raise serializers.ValidationError({"params": f"Faltan campos requeridos: {', '.join(missing)}"})

            # Basic caps to avoid huge payloads.
            analysis_html = str(params.get("analysis_html") or "")
            if len(analysis_html) > 200_000:
                raise serializers.ValidationError({"params": "analysis_html es demasiado grande"})

            return attrs

        if report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            # Administrative staff only.
            if role in {User.ROLE_TEACHER, User.ROLE_PARENT, User.ROLE_STUDENT}:
                raise serializers.ValidationError({"detail": "No tienes permisos para generar este informe."})

            certificate_uuid = str(params.get("certificate_uuid") or "").strip()
            verify_url = str(params.get("verify_url") or "").strip()
            if not certificate_uuid:
                raise serializers.ValidationError({"params": "certificate_uuid es requerido"})
            if not verify_url:
                raise serializers.ValidationError({"params": "verify_url es requerido"})

            return attrs

        raise serializers.ValidationError({"report_type": "report_type no soportado"})


class ReportJobSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()

    class Meta:
        model = ReportJob
        fields = [
            "id",
            "report_type",
            "params",
            "status",
            "progress",
            "created_at",
            "started_at",
            "finished_at",
            "expires_at",
            "output_filename",
            "output_size_bytes",
            "error_code",
            "error_message",
            "download_url",
            "preview_url",
        ]

    def get_download_url(self, obj: ReportJob):
        request = self.context.get("request")
        if request is None:
            return None
        if obj.status != ReportJob.Status.SUCCEEDED:
            return None
        return request.build_absolute_uri(f"/api/reports/jobs/{obj.id}/download/")

    def get_preview_url(self, obj: ReportJob):
        request = self.context.get("request")
        if request is None:
            return None
        return request.build_absolute_uri(f"/api/reports/jobs/{obj.id}/preview/")
