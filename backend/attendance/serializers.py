from __future__ import annotations

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from academic.models import Period, TeacherAssignment
from students.models import Enrollment

from .models import AttendanceRecord, AttendanceSession


class AttendanceSessionCreateSerializer(serializers.Serializer):
    teacher_assignment_id = serializers.IntegerField()
    period_id = serializers.IntegerField()
    class_date = serializers.DateField(required=False)
    client_uuid = serializers.UUIDField(required=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        ta = TeacherAssignment.objects.select_related("group", "academic_year", "academic_load", "academic_load__subject").filter(
            id=attrs["teacher_assignment_id"]
        ).first()
        if not ta:
            raise serializers.ValidationError("TeacherAssignment no encontrado")

        period = Period.objects.select_related("academic_year").filter(id=attrs["period_id"]).first()
        if not period:
            raise serializers.ValidationError("Periodo no encontrado")

        if ta.academic_year_id != period.academic_year_id:
            raise serializers.ValidationError("La clase debe pertenecer al mismo año académico del periodo.")

        if getattr(user, "role", None) == "TEACHER":
            if ta.teacher_id != getattr(user, "id", None):
                raise serializers.ValidationError("No tienes permiso para crear clases en esta asignación.")

        attrs["_ta"] = ta
        attrs["_period"] = period
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        ta: TeacherAssignment = validated_data["_ta"]
        period: Period = validated_data["_period"]
        class_date = validated_data.get("class_date") or timezone.localdate()
        client_uuid = validated_data["client_uuid"]

        # Idempotency: if the same user submits the same client UUID, return existing session.
        existing = AttendanceSession.objects.filter(created_by=user, client_uuid=client_uuid).first()
        if existing:
            return existing

        with transaction.atomic():
            last_seq = (
                AttendanceSession.objects.select_for_update()
                .filter(teacher_assignment=ta, period=period, class_date=class_date)
                .aggregate(m=Max("sequence"))
                .get("m")
            )
            next_seq = int(last_seq or 0) + 1

            session = AttendanceSession.objects.create(
                teacher_assignment=ta,
                period=period,
                class_date=class_date,
                starts_at=timezone.now(),
                sequence=next_seq,
                created_by=user if getattr(user, "is_authenticated", False) else None,
                client_uuid=client_uuid,
            )

        return session


class AttendanceSessionSerializer(serializers.ModelSerializer):
    teacher_assignment = serializers.IntegerField(source="teacher_assignment_id", read_only=True)
    period = serializers.IntegerField(source="period_id", read_only=True)

    group_id = serializers.IntegerField(source="teacher_assignment.group_id", read_only=True)
    grade_id = serializers.IntegerField(source="teacher_assignment.group.grade_id", read_only=True)
    grade_name = serializers.CharField(source="teacher_assignment.group.grade.name", read_only=True)
    subject_name = serializers.SerializerMethodField()
    group_name = serializers.CharField(source="teacher_assignment.group.name", read_only=True)
    group_display = serializers.SerializerMethodField()

    def get_group_display(self, obj: AttendanceSession) -> str:
        try:
            g = obj.teacher_assignment.group
            grade = getattr(getattr(g, "grade", None), "name", "") or ""
            name = getattr(g, "name", "") or ""
            if grade and name:
                return f"{grade} {name}"
            return name or grade
        except Exception:
            return ""

    def get_subject_name(self, obj: AttendanceSession) -> str:
        try:
            al = getattr(obj.teacher_assignment, "academic_load", None)
            subj = getattr(al, "subject", None)
            return getattr(subj, "name", "") or ""
        except Exception:
            return ""

    class Meta:
        model = AttendanceSession
        fields = [
            "id",
            "teacher_assignment",
            "period",
            "class_date",
            "starts_at",
            "sequence",
            "group_id",
            "group_name",
            "grade_id",
            "grade_name",
            "group_display",
            "subject_name",
            "locked_at",
            "created_at",
            "updated_at",
        ]


class AttendanceRecordSerializer(serializers.ModelSerializer):
    session = serializers.IntegerField(source="session_id", read_only=True)
    enrollment = serializers.IntegerField(source="enrollment_id")

    student_full_name = serializers.CharField(source="enrollment.student.user.get_full_name", read_only=True)

    excuse_attachment_available = serializers.SerializerMethodField()
    excuse_attachment_download_url = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "session",
            "enrollment",
            "student_full_name",
            "status",
            "tardy_at",
            "excuse_reason",
            "excuse_attachment_available",
            "excuse_attachment_download_url",
            "marked_at",
            "updated_at",
        ]
        extra_kwargs = {
            "tardy_at": {"read_only": True},
        }

    def get_excuse_attachment_available(self, obj: AttendanceRecord) -> bool:
        return bool(getattr(obj, "excuse_attachment", None))

    def get_excuse_attachment_download_url(self, obj: AttendanceRecord) -> str | None:
        if not getattr(obj, "excuse_attachment", None):
            return None
        request = self.context.get("request")
        if not request:
            return None
        return request.build_absolute_uri(f"/api/attendance/records/{obj.id}/excuse-attachment/")


class AttendanceBulkMarkItemSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    status = serializers.ChoiceField(choices=AttendanceRecord.STATUS_CHOICES)
    excuse_reason = serializers.CharField(required=False, allow_blank=True)


class AttendanceBulkMarkSerializer(serializers.Serializer):
    records = AttendanceBulkMarkItemSerializer(many=True)

    def validate(self, attrs):
        # Basic shape validation. Permissions and membership checks are done in the view.
        return attrs


class AttendanceMarkTardySerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()


class AttendanceAttachExcuseSerializer(serializers.Serializer):
    excuse_reason = serializers.CharField(required=False, allow_blank=True)
    excuse_attachment = serializers.FileField(required=False)
