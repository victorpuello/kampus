from django.conf import settings
from django.db import models
from core.models import Campus


class AcademicYear(models.Model):
    year = models.PositiveIntegerField(unique=True)

    class Meta:
        ordering = ["-year"]

    def __str__(self) -> str:
        return str(self.year)


class Period(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear, related_name="periods", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)

    class Meta:
        ordering = ["start_date"]

    def __str__(self) -> str:
        return f"{self.name} ({self.academic_year})"


class AcademicLevel(models.Model):
    LEVEL_TYPES = (
        ('PRESCHOOL', 'Preescolar'),
        ('PRIMARY', 'Básica Primaria'),
        ('SECONDARY', 'Básica Secundaria'),
        ('MEDIA', 'Media Académica'),
    )
    name = models.CharField(max_length=100, verbose_name="Nombre del Nivel")
    level_type = models.CharField(max_length=20, choices=LEVEL_TYPES, default='PRIMARY')
    min_age = models.PositiveIntegerField(default=5, verbose_name="Edad Mínima")
    max_age = models.PositiveIntegerField(default=100, verbose_name="Edad Máxima")
    
    def __str__(self):
        return self.name


class Grade(models.Model):
    name = models.CharField(max_length=50)
    level = models.ForeignKey(AcademicLevel, related_name="grades", on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("name",)

    def __str__(self) -> str:
        return self.name


class Group(models.Model):
    name = models.CharField(max_length=50)  # e.g. "A", "10-1"
    grade = models.ForeignKey(Grade, related_name="groups", on_delete=models.CASCADE)
    campus = models.ForeignKey(Campus, related_name="groups", on_delete=models.CASCADE, null=True, blank=True)
    academic_year = models.ForeignKey(
        AcademicYear, related_name="groups", on_delete=models.CASCADE
    )
    director = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="directed_groups",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": "TEACHER"},
    )

    class Meta:
        unique_together = ("name", "grade", "academic_year")

    def __str__(self) -> str:
        return f"{self.grade} - {self.name} ({self.academic_year})"


class Area(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name


class Subject(models.Model):
    name = models.CharField(max_length=100)
    area = models.ForeignKey(Area, related_name="subjects", on_delete=models.CASCADE)
    grade = models.ForeignKey(Grade, related_name="subjects", on_delete=models.CASCADE)
    weight_percentage = models.PositiveIntegerField(
        default=100, help_text="Percentage weight within the area"
    )
    hours_per_week = models.PositiveIntegerField(default=1)

    def __str__(self) -> str:
        return f"{self.name} - {self.grade}"


class TeacherAssignment(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="assignments",
        on_delete=models.CASCADE,
        limit_choices_to={"role": "TEACHER"},
    )
    subject = models.ForeignKey(
        Subject, related_name="assignments", on_delete=models.CASCADE
    )
    group = models.ForeignKey(
        Group, related_name="assignments", on_delete=models.CASCADE
    )
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("teacher", "subject", "group", "academic_year")

    def __str__(self) -> str:
        return f"{self.teacher} - {self.subject} - {self.group}"


class EvaluationScale(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear, related_name="evaluation_scales", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=50)  # e.g. "Superior", "Alto"
    min_score = models.DecimalField(max_digits=4, decimal_places=2)
    max_score = models.DecimalField(max_digits=4, decimal_places=2)

    def __str__(self) -> str:
        return f"{self.name} ({self.min_score} - {self.max_score})"


class EvaluationComponent(models.Model):
    subject = models.ForeignKey(
        Subject, related_name="components", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=50)  # e.g. "Saber", "Hacer", "Ser"
    weight_percentage = models.PositiveIntegerField(
        help_text="Percentage weight within the subject"
    )

    def __str__(self) -> str:
        return f"{self.name} ({self.weight_percentage}%) - {self.subject}"


class Assessment(models.Model):
    component = models.ForeignKey(
        EvaluationComponent, related_name="assessments", on_delete=models.CASCADE
    )
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    date = models.DateField(null=True, blank=True)
    weight_percentage = models.PositiveIntegerField(
        default=100, help_text="Percentage weight within the component"
    )

    def __str__(self) -> str:
        return f"{self.name} - {self.component}"


class StudentGrade(models.Model):
    assessment = models.ForeignKey(
        Assessment, related_name="grades", on_delete=models.CASCADE
    )
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE)
    score = models.DecimalField(max_digits=4, decimal_places=2)
    feedback = models.TextField(blank=True)

    class Meta:
        unique_together = ("assessment", "student")

    def __str__(self) -> str:
        return f"{self.student} - {self.assessment}: {self.score}"


class Achievement(models.Model):
    subject = models.ForeignKey(
        Subject, related_name="achievements", on_delete=models.CASCADE
    )
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    description = models.TextField()

    def __str__(self) -> str:
        return f"{self.subject} - {self.period}: {self.description[:50]}..."

