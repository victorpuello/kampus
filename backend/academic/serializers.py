from rest_framework import serializers
from .models import AcademicYear, Grade


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "year"]
        read_only_fields = ["id"]


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ["id", "name"]
        read_only_fields = ["id"]

