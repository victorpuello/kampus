from rest_framework import serializers
from django.db import transaction
from .models import Teacher
from users.serializers import UserSerializer, UserCreateSerializer
from users.models import User


class TeacherSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Teacher
        fields = "__all__"


class TeacherUpdateSerializer(serializers.ModelSerializer):
    user = UserSerializer()

    class Meta:
        model = Teacher
        fields = "__all__"

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', None)
        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                if attr != 'password':  # Don't update password here
                    setattr(user, attr, value)
            user.save()
        
        return super().update(instance, validated_data)


class TeacherCreateSerializer(serializers.ModelSerializer):
    user = UserCreateSerializer()

    class Meta:
        model = Teacher
        fields = [
            "user",
            "document_type",
            "document_number",
            "phone",
            "address",
            "title",
            "specialty",
            "salary_scale",
            "hiring_date",
        ]

    def create(self, validated_data):
        user_data = validated_data.pop("user")
        user_data["role"] = User.ROLE_TEACHER  # Force role

        with transaction.atomic():
            user_serializer = UserCreateSerializer(data=user_data)
            user_serializer.is_valid(raise_exception=True)
            user = user_serializer.save()

            teacher = Teacher.objects.create(user=user, **validated_data)
            return teacher
