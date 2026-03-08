from django.utils import timezone
from rest_framework import serializers

from users.models import User

from .models import Notification, OperationalPlanActivity


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "title",
            "body",
            "url",
            "created_at",
            "read_at",
            "is_read",
        ]
        read_only_fields = fields

    def get_is_read(self, obj: Notification) -> bool:
        return obj.read_at is not None


class OperationalPlanResponsibleUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "role"]
        read_only_fields = fields

    def get_full_name(self, obj: User) -> str:
        return obj.get_full_name() or obj.username


class OperationalPlanActivitySerializer(serializers.ModelSerializer):
    responsible_users = OperationalPlanResponsibleUserSerializer(many=True, read_only=True)
    responsible_user_ids = serializers.PrimaryKeyRelatedField(
        source="responsible_users",
        queryset=User.objects.filter(is_active=True, role=User.ROLE_TEACHER),
        many=True,
        write_only=True,
        required=False,
    )
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    days_until = serializers.SerializerMethodField()
    responsables_texto = serializers.SerializerMethodField()
    responsables_sin_mapear = serializers.SerializerMethodField()

    class Meta:
        model = OperationalPlanActivity
        fields = [
            "id",
            "title",
            "description",
            "activity_date",
            "end_date",
            "is_active",
            "is_completed",
            "completed_at",
            "completion_notes",
            "completed_by",
            "completed_by_name",
            "responsible_users",
            "responsible_user_ids",
            "days_until",
            "responsables_texto",
            "responsables_sin_mapear",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "responsible_users",
            "days_until",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj: OperationalPlanActivity) -> str | None:
        if obj.created_by_id is None:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_updated_by_name(self, obj: OperationalPlanActivity) -> str | None:
        if obj.updated_by_id is None:
            return None
        return obj.updated_by.get_full_name() or obj.updated_by.username

    def get_completed_by_name(self, obj: OperationalPlanActivity) -> str | None:
        if obj.completed_by_id is None:
            return None
        return obj.completed_by.get_full_name() or obj.completed_by.username

    def get_days_until(self, obj: OperationalPlanActivity) -> int:
        return int((obj.activity_date - timezone.localdate()).days)

    def validate(self, attrs):
        start_date = attrs.get("activity_date", getattr(self.instance, "activity_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "end_date no puede ser menor que activity_date."})

        return attrs

    def get_responsables_texto(self, obj: OperationalPlanActivity) -> str:
        for line in str(obj.description or "").splitlines():
            clean = line.strip()
            if clean.startswith("Responsables (texto):"):
                return clean.split(":", 1)[1].strip()
        return ""

    def get_responsables_sin_mapear(self, obj: OperationalPlanActivity) -> bool:
        raw = self.get_responsables_texto(obj)
        if not raw:
            return False
        return obj.responsible_users.count() == 0
