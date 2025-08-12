from rest_framework import serializers
from .models import Student, FamilyMember, Enrollment


class FamilyMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyMember
        fields = [
            "id",
            "student",
            "user",
            "full_name",
            "relationship",
            "phone",
            "email",
            "is_main_guardian",
        ]
        read_only_fields = ["id"]


class StudentSerializer(serializers.ModelSerializer):
    family_members = FamilyMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Student
        fields = [
            "user",
            "document_type",
            "document_number",
            "birth_date",
            "blood_type",
            "eps",
            "address",
            "ethnicity",
            "family_members",
        ]


class EnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "academic_year",
            "grade",
            "status",
        ]
        read_only_fields = ["id"]
