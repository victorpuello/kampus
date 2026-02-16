from __future__ import annotations

import re
import unicodedata

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from .commission_preconditions import evaluate_commission_preconditions
from .models import (
    Commission,
    CommissionRuleConfig,
    CommissionStudentDecision,
    CommitmentActa,
)


class CommissionRuleConfigSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    academic_year_year = serializers.IntegerField(source="academic_year.year", read_only=True)

    class Meta:
        model = CommissionRuleConfig
        fields = "__all__"


class CommissionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    period_name = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()

    class Meta:
        model = Commission
        fields = "__all__"
        read_only_fields = ["created_by", "closed_by", "closed_at", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        try:
            user = obj.created_by
            return user.get_full_name() if user is not None else ""
        except ObjectDoesNotExist:
            return ""

    def get_closed_by_name(self, obj):
        try:
            user = obj.closed_by
            return user.get_full_name() if user is not None else ""
        except ObjectDoesNotExist:
            return ""

    def get_period_name(self, obj):
        try:
            period = obj.period
            return getattr(period, "name", "") if period is not None else ""
        except ObjectDoesNotExist:
            return ""

    def get_group_name(self, obj):
        try:
            group = obj.group
            return getattr(group, "name", "") if group is not None else ""
        except ObjectDoesNotExist:
            return ""

    def validate(self, attrs):
        commission_type = attrs.get("commission_type")
        period = attrs.get("period")
        academic_year = attrs.get("academic_year")
        group = attrs.get("group")

        if self.instance is not None:
            commission_type = commission_type or self.instance.commission_type
            period = period if "period" in attrs else self.instance.period
            academic_year = academic_year or self.instance.academic_year
            group = group if "group" in attrs else self.instance.group

        if commission_type == Commission.TYPE_EVALUATION and period is None:
            raise serializers.ValidationError({"period": "La comisión de evaluación requiere periodo."})

        if commission_type == Commission.TYPE_PROMOTION and period is not None:
            raise serializers.ValidationError({"period": "La comisión de promoción no debe incluir periodo."})

        if period is not None and academic_year is not None and period.academic_year_id != academic_year.id:
            raise serializers.ValidationError({"period": "El periodo no corresponde al año académico."})

        if group is not None and academic_year is not None and group.academic_year_id != academic_year.id:
            raise serializers.ValidationError({"group": "El grupo no corresponde al año académico."})

        if self.instance is None and commission_type and academic_year is not None:
            preconditions = evaluate_commission_preconditions(
                commission_type=commission_type,
                academic_year_id=int(academic_year.id),
                period=period,
                group=group,
            )
            if preconditions.get("blocking_items"):
                raise serializers.ValidationError({"preconditions": preconditions})

        attrs["title"] = self._build_title(
            commission_type=commission_type,
            period=period,
            group=group,
            academic_year=academic_year,
        )

        return attrs

    def _normalize_segment(self, value):
        text = "" if value is None else str(value).strip()
        if not text:
            return ""
        normalized = unicodedata.normalize("NFD", text)
        normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
        normalized = re.sub(r"[^0-9A-Za-z]+", "_", normalized)
        normalized = normalized.strip("_")
        return normalized.upper()

    def _build_title(self, *, commission_type, period, group, academic_year):
        if period is not None:
            period_raw = getattr(period, "name", "")
        elif commission_type == Commission.TYPE_PROMOTION:
            period_raw = "ANUAL"
        else:
            period_raw = "SIN_PERIODO"

        group_raw = ""
        grade_raw = ""
        if group is not None:
            group_raw = getattr(group, "name", "")
            grade = getattr(group, "grade", None)
            grade_raw = getattr(grade, "name", "") if grade is not None else ""

        year_raw = getattr(academic_year, "year", "")

        period_segment = self._normalize_segment(period_raw) or "SIN_PERIODO"
        grade_segment = self._normalize_segment(grade_raw) or "SIN_GRADO"
        group_segment = self._normalize_segment(group_raw) or "SIN_GRUPO"
        year_segment = self._normalize_segment(year_raw) or "SIN_ANIO"

        return f"Comisión_{period_segment}_{grade_segment}_{group_segment}_{year_segment}"


class CommissionStudentDecisionSerializer(serializers.ModelSerializer):
    commission_type = serializers.CharField(source="commission.commission_type", read_only=True)
    student_id = serializers.IntegerField(source="enrollment.student_id", read_only=True)
    student_name = serializers.CharField(source="enrollment.student.user.get_full_name", read_only=True)
    student_document = serializers.CharField(source="enrollment.student.document_number", read_only=True)
    group_name = serializers.CharField(source="enrollment.group.name", read_only=True)
    acta_id = serializers.IntegerField(source="commitment_acta.id", read_only=True)

    class Meta:
        model = CommissionStudentDecision
        fields = "__all__"
        read_only_fields = [
            "failed_subjects_count",
            "failed_areas_count",
            "is_flagged",
            "created_at",
            "updated_at",
        ]


class CommitmentActaSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="decision.enrollment.student_id", read_only=True)
    student_document = serializers.CharField(source="decision.enrollment.student.document_number", read_only=True)

    class Meta:
        model = CommitmentActa
        fields = "__all__"
        read_only_fields = ["observer_annotation", "generated_by", "generated_at", "updated_at"]
