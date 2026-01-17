from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from academic.models import AcademicYear, Group, TeacherAssignment
from students.models import Enrollment, Student

from .models import (
    DisciplineCase,
    DisciplineCaseAttachment,
    DisciplineCaseEvent,
    DisciplineCaseParticipant,
    DisciplineCaseNotificationLog,
)


class DisciplineCaseParticipantSerializer(serializers.ModelSerializer):
    student_id = serializers.PrimaryKeyRelatedField(
        source="student", queryset=Student.objects.select_related("user").all()
    )

    class Meta:
        model = DisciplineCaseParticipant
        fields = ["id", "student_id", "role", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class DisciplineCaseAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineCaseAttachment
        fields = [
            "id",
            "kind",
            "file",
            "description",
            "uploaded_by",
            "uploaded_at",
        ]
        read_only_fields = ["id", "uploaded_by", "uploaded_at"]


class DisciplineCaseEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineCaseEvent
        fields = ["id", "event_type", "text", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class DisciplineCaseNotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineCaseNotificationLog
        fields = [
            "id",
            "channel",
            "status",
            "recipient_user",
            "recipient_family_member",
            "recipient_name",
            "recipient_contact",
            "note",
            "external_id",
            "error",
            "created_by",
            "created_at",
            "acknowledged_at",
            "acknowledged_by",
        ]
        read_only_fields = fields


class DisciplineCaseListSerializer(serializers.ModelSerializer):
    student_id = serializers.PrimaryKeyRelatedField(source="student", read_only=True)
    enrollment_id = serializers.PrimaryKeyRelatedField(source="enrollment", read_only=True)

    student_full_name = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    grade_name = serializers.SerializerMethodField()
    academic_year = serializers.SerializerMethodField()

    descargos_overdue = serializers.SerializerMethodField()

    def get_descargos_overdue(self, obj: DisciplineCase) -> bool:
        due = getattr(obj, "descargos_due_at", None)
        if not due:
            return False
        has_descargos = obj.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).exists()
        return (not has_descargos) and timezone.now() > due

    def get_student_full_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.student.user.get_full_name()
        except Exception:
            return ""

    def get_group_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.enrollment.group.name if obj.enrollment.group else ""
        except Exception:
            return ""

    def get_grade_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.enrollment.grade.name if obj.enrollment.grade else ""
        except Exception:
            return ""

    def get_academic_year(self, obj: DisciplineCase):
        try:
            return obj.enrollment.academic_year.year
        except Exception:
            return None

    class Meta:
        model = DisciplineCase
        fields = [
            "id",
            "student_id",
            "student_full_name",
            "enrollment_id",
            "academic_year",
            "grade_name",
            "group_name",
            "occurred_at",
            "location",
            "manual_severity",
            "law_1620_type",
            "status",
            "sealed_at",
            "sealed_by",
            "sealed_hash",
            "descargos_due_at",
            "descargos_overdue",
            "created_at",
            "updated_at",
        ]


class DisciplineCaseDetailSerializer(serializers.ModelSerializer):
    student_id = serializers.PrimaryKeyRelatedField(source="student", read_only=True)
    enrollment_id = serializers.PrimaryKeyRelatedField(source="enrollment", read_only=True)

    student_full_name = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    grade_name = serializers.SerializerMethodField()
    academic_year = serializers.SerializerMethodField()

    descargos_overdue = serializers.SerializerMethodField()

    def get_descargos_overdue(self, obj: DisciplineCase) -> bool:
        due = getattr(obj, "descargos_due_at", None)
        if not due:
            return False
        has_descargos = obj.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).exists()
        return (not has_descargos) and timezone.now() > due

    def get_student_full_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.student.user.get_full_name()
        except Exception:
            return ""

    def get_group_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.enrollment.group.name if obj.enrollment.group else ""
        except Exception:
            return ""

    def get_grade_name(self, obj: DisciplineCase) -> str:
        try:
            return obj.enrollment.grade.name if obj.enrollment.grade else ""
        except Exception:
            return ""

    def get_academic_year(self, obj: DisciplineCase):
        try:
            return obj.enrollment.academic_year.year
        except Exception:
            return None

    participants = DisciplineCaseParticipantSerializer(many=True, read_only=True)
    attachments = DisciplineCaseAttachmentSerializer(many=True, read_only=True)
    events = DisciplineCaseEventSerializer(many=True, read_only=True)
    notification_logs = DisciplineCaseNotificationLogSerializer(many=True, read_only=True)

    class Meta:
        model = DisciplineCase
        fields = [
            "id",
            "student_id",
            "student_full_name",
            "enrollment_id",
            "academic_year",
            "grade_name",
            "group_name",
            "occurred_at",
            "location",
            "narrative",
            "manual_severity",
            "law_1620_type",
            "status",
            "notified_guardian_at",
            "descargos_due_at",
            "descargos_overdue",
            "decided_at",
            "decided_by",
            "decision_text",
            "closed_at",
            "closed_by",
            "sealed_at",
            "sealed_by",
            "sealed_hash",
            "created_by",
            "created_at",
            "updated_at",
            "participants",
            "attachments",
            "events",
            "notification_logs",
        ]


class DisciplineCaseCreateSerializer(serializers.ModelSerializer):
    enrollment_id = serializers.PrimaryKeyRelatedField(
        source="enrollment", queryset=Enrollment.objects.select_related("student", "group", "academic_year").all()
    )

    class Meta:
        model = DisciplineCase
        fields = [
            "id",
            "enrollment_id",
            "occurred_at",
            "location",
            "narrative",
            "manual_severity",
            "law_1620_type",
        ]
        read_only_fields = ["id"]

    def validate_enrollment_id(self, enrollment: Enrollment):
        if enrollment.status != "ACTIVE":
            raise serializers.ValidationError("La matrícula no está activa.")

        # Default rule: solo casos del año activo (MVP)
        active_year = AcademicYear.objects.filter(status="ACTIVE").first()
        if active_year and enrollment.academic_year_id != active_year.id:
            raise serializers.ValidationError("Solo se permiten casos del año académico activo.")

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            directed_groups = Group.objects.filter(director=user)
            if active_year:
                directed_groups = directed_groups.filter(academic_year=active_year)
            if enrollment.group_id is None:
                raise serializers.ValidationError("La matrícula no tiene grupo asignado.")

            is_director = directed_groups.filter(id=enrollment.group_id).exists()
            if active_year:
                is_assigned = TeacherAssignment.objects.filter(
                    teacher=user,
                    academic_year=active_year,
                    group_id=enrollment.group_id,
                ).exists()
            else:
                is_assigned = TeacherAssignment.objects.filter(
                    teacher=user,
                    group_id=enrollment.group_id,
                ).exists()

            if not (is_director or is_assigned):
                raise serializers.ValidationError("No tienes permisos para registrar casos para este grupo.")

        return enrollment

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        enrollment: Enrollment = validated_data["enrollment"]
        validated_data["student"] = enrollment.student
        validated_data["created_by"] = user if getattr(user, "is_authenticated", False) else None

        case = super().create(validated_data)

        # Default descargos deadline (best-effort)
        try:
            days = int(getattr(settings, "DISCIPLINE_DESCARGOS_DUE_DAYS", 0) or 0)
        except Exception:
            days = 0

        if days > 0 and case.occurred_at and not case.descargos_due_at:
            case.descargos_due_at = case.occurred_at + timedelta(days=days)
            case.save(update_fields=["descargos_due_at", "updated_at"])
        DisciplineCaseEvent.objects.create(
            case=case,
            event_type=DisciplineCaseEvent.Type.CREATED,
            text="",
            created_by=user if getattr(user, "is_authenticated", False) else None,
        )
        return case


class CaseSetDescargosDeadlineSerializer(serializers.Serializer):
    descargos_due_at = serializers.DateTimeField(required=False, allow_null=True)


class CaseAddAttachmentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=DisciplineCaseAttachment.Kind.choices, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    file = serializers.FileField()


class CaseAddParticipantSerializer(serializers.Serializer):
    student_id = serializers.PrimaryKeyRelatedField(queryset=Student.objects.select_related("user").all())
    role = serializers.ChoiceField(choices=DisciplineCaseParticipant.Role.choices)
    notes = serializers.CharField(required=False, allow_blank=True)


class CaseRecordDescargosSerializer(serializers.Serializer):
    text = serializers.CharField()


class CaseNotifyGuardianSerializer(serializers.Serializer):
    channel = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class CaseDecideSerializer(serializers.Serializer):
    decision_text = serializers.CharField()

    def validate(self, attrs):
        decision_text = (attrs.get("decision_text") or "").strip()
        if not decision_text:
            raise serializers.ValidationError({"decision_text": "La decisión es obligatoria."})
        return attrs


class CaseAddNoteSerializer(serializers.Serializer):
    text = serializers.CharField()

    def validate(self, attrs):
        text = (attrs.get("text") or "").strip()
        if not text:
            raise serializers.ValidationError({"text": "El texto es obligatorio."})
        return {"text": text}
