from __future__ import annotations

import re

from rest_framework import serializers

from .models import (
    NoveltyType,
    NoveltyReason,
    NoveltyCase,
    NoveltyCaseTransition,
    NoveltyRequiredDocumentRule,
    NoveltyAttachment,
    NoveltyExecution,
    CapacityBucket,
    GroupCapacityOverride,
    NoveltyReversion,
)


class NoveltyTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyType
        fields = [
            "id",
            "code",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        ]


class NoveltyReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyReason
        fields = [
            "id",
            "novelty_type",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        ]


class NoveltyCaseSerializer(serializers.ModelSerializer):
    execution = serializers.SerializerMethodField(read_only=True)
    reversion = serializers.SerializerMethodField(read_only=True)

    @staticmethod
    def _is_undecimo_grade(*, grade_name: str | None, grade_ordinal: int | None) -> bool:
        # Be tolerant: different installations may store `ordinal` differently.
        if grade_ordinal in {11, 13}:
            return True

        name = (grade_name or "").strip().lower()
        if not name:
            return False

        # Normalize common forms: "11", "11°", "Grado 11", "Undécimo".
        if "undecimo" in name or "undécimo" in name:
            return True
        if re.search(r"\b11\b", name):
            return True
        return False

    def validate(self, attrs):
        attrs = super().validate(attrs)

        # Only enforce on create; execution also validates.
        if self.instance is not None:
            return attrs

        novelty_type = attrs.get("novelty_type")
        student = attrs.get("student")

        try:
            code = (getattr(novelty_type, "code", "") or "").strip().lower()
        except Exception:
            code = ""

        if code in {"graduacion", "graduación", "graduado", "graduada"}:
            if student is None:
                raise serializers.ValidationError({"student": "Estudiante requerido para graduación"})

            active = None
            try:
                active = (
                    student.enrollment_set.select_related("grade")
                    .filter(status="ACTIVE")
                    .order_by("-academic_year__year", "-id")
                    .first()
                )
            except Exception:
                active = None

            grade_name = getattr(getattr(active, "grade", None), "name", None) if active else None
            grade_ordinal = getattr(getattr(active, "grade", None), "ordinal", None) if active else None

            if not self._is_undecimo_grade(grade_name=grade_name, grade_ordinal=grade_ordinal):
                detail = "Graduación solo está disponible para estudiantes con matrícula ACTIVA en grado Undécimo (11)."
                if grade_name:
                    detail = f"{detail} Grado actual: {grade_name}."
                raise serializers.ValidationError({"detail": detail})

        return attrs

    class Meta:
        model = NoveltyCase
        fields = [
            "id",
            "student",
            "institution",
            "novelty_type",
            "novelty_reason",
            "status",
            "radicado",
            "radicado_year",
            "radicado_seq",
            "filed_at",
            "requested_at",
            "effective_date",
            "executed_at",
            "closed_at",
            "created_by",
            "payload",
            "idempotency_key",
            "execution",
            "reversion",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "radicado",
            "radicado_year",
            "radicado_seq",
            "filed_at",
            "executed_at",
            "closed_at",
            "created_by",
            "execution",
            "reversion",
            "created_at",
            "updated_at",
        ]

    def get_execution(self, obj: NoveltyCase):
        try:
            execution = obj.execution
        except Exception:
            return None
        return NoveltyExecutionSerializer(execution).data

    def get_reversion(self, obj: NoveltyCase):
        try:
            rev = obj.reversion
        except Exception:
            return None
        return NoveltyReversionSerializer(rev).data

    def create(self, validated_data):
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        # Default institution when omitted:
        # - If student has an ACTIVE enrollment with campus, use its institution.
        # - If there is exactly one Institution in the system, use it.
        institution = validated_data.get("institution")
        if institution is None:
            student = validated_data.get("student")
            if student is not None:
                try:
                    active_enrollment = (
                        student.enrollment_set.select_related("campus__institution")
                        .filter(status="ACTIVE")
                        .exclude(campus__isnull=True)
                        .order_by("-academic_year__year")
                        .first()
                    )
                except Exception:
                    active_enrollment = None

                if active_enrollment and getattr(active_enrollment, "campus", None) and getattr(active_enrollment.campus, "institution", None):
                    validated_data["institution"] = active_enrollment.campus.institution
                else:
                    from core.models import Institution

                    qs = Institution.objects.all()
                    if qs.count() == 1:
                        validated_data["institution"] = qs.first()

        return super().create(validated_data)


class NoveltyCaseTransitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyCaseTransition
        fields = [
            "id",
            "case",
            "from_status",
            "to_status",
            "actor",
            "actor_role",
            "comment",
            "ip_address",
            "created_at",
        ]
        read_only_fields = ["created_at"]


class NoveltyRequiredDocumentRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyRequiredDocumentRule
        fields = [
            "id",
            "novelty_type",
            "novelty_reason",
            "doc_type",
            "is_required",
            "visibility",
            "created_at",
            "updated_at",
        ]


class NoveltyAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyAttachment
        fields = [
            "id",
            "case",
            "doc_type",
            "file",
            "issued_at",
            "issued_by",
            "valid_until",
            "visibility",
            "uploaded_by",
            "uploaded_at",
        ]
        read_only_fields = ["uploaded_by", "uploaded_at"]

    def validate_file(self, value):
        max_size_mb = 10
        try:
            if getattr(value, "size", 0) and value.size > max_size_mb * 1024 * 1024:
                raise serializers.ValidationError(f"Archivo demasiado grande (máx {max_size_mb}MB)")
        except Exception:
            # If size isn't available, don't block.
            pass
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            validated_data["uploaded_by"] = request.user
        return super().create(validated_data)


class NoveltyExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyExecution
        fields = [
            "id",
            "case",
            "idempotency_key",
            "executed_by",
            "executed_at",
            "before_snapshot",
            "after_snapshot",
        ]


class CapacityBucketSerializer(serializers.ModelSerializer):
    class Meta:
        model = CapacityBucket
        fields = [
            "id",
            "campus",
            "grade",
            "academic_year",
            "shift",
            "modality",
            "capacity",
            "is_active",
            "created_at",
            "updated_at",
        ]


class GroupCapacityOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupCapacityOverride
        fields = [
            "id",
            "group",
            "capacity",
            "is_active",
            "created_at",
            "updated_at",
        ]


class NoveltyReversionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoveltyReversion
        fields = [
            "id",
            "case",
            "reverted_by",
            "reverted_at",
            "comment",
            "before_snapshot",
            "after_snapshot",
        ]
