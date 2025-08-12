from django.conf import settings
from django.db import models


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True
    )
    document_type = models.CharField(max_length=20, blank=True)
    document_number = models.CharField(max_length=50, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    blood_type = models.CharField(max_length=5, blank=True)
    eps = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True)
    ethnicity = models.CharField(max_length=100, blank=True)

    def __str__(self) -> str:
        return f"{self.user.get_full_name()} ({self.user.username})"


class FamilyMember(models.Model):
    student = models.ForeignKey(
        Student, related_name="family_members", on_delete=models.CASCADE
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    full_name = models.CharField(max_length=200)
    relationship = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    is_main_guardian = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"{self.full_name} - {self.relationship}"


class Enrollment(models.Model):
    from academic.models import AcademicYear, Grade

    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE)
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE)
    status = models.CharField(
        max_length=20,
        choices=(
            ("ACTIVE", "Activo"),
            ("RETIRED", "Retirado"),
            ("GRADUATED", "Graduado"),
        ),
        default="ACTIVE",
    )

    class Meta:
        unique_together = ("student", "academic_year")

    def __str__(self) -> str:
        return f"{self.student} - {self.academic_year} - {self.grade}"
