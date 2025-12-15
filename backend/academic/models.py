from django.conf import settings
from django.db import models
from core.models import Campus
import uuid


class AcademicYear(models.Model):
    STATUS_PLANNING = 'PLANNING'
    STATUS_ACTIVE = 'ACTIVE'
    STATUS_CLOSED = 'CLOSED'
    
    STATUS_CHOICES = [
        (STATUS_PLANNING, 'En Planeación'),
        (STATUS_ACTIVE, 'Activo'),
        (STATUS_CLOSED, 'Finalizado'),
    ]

    year = models.PositiveIntegerField(unique=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PLANNING,
        verbose_name="Estado"
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="Fecha Inicio")
    end_date = models.DateField(null=True, blank=True, verbose_name="Fecha Fin")

    class Meta:
        ordering = ["-year"]

    def __str__(self) -> str:
        return f"{self.year} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if self.status == self.STATUS_ACTIVE:
            # Si este año se marca como activo, cerrar los otros activos
            AcademicYear.objects.filter(status=self.STATUS_ACTIVE).exclude(pk=self.pk).update(status=self.STATUS_CLOSED)
        super().save(*args, **kwargs)


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
    SHIFT_CHOICES = (
        ('MORNING', 'Mañana'),
        ('AFTERNOON', 'Tarde'),
        ('NIGHT', 'Noche'),
        ('FULL', 'Jornada Única'),
        ('WEEKEND', 'Fin de Semana'),
    )
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
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES, default='MORNING')
    classroom = models.CharField(max_length=50, blank=True, null=True)
    capacity = models.PositiveIntegerField(default=40, verbose_name="Cupo Máximo")

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
    name = models.CharField(max_length=100, unique=True)
    area = models.ForeignKey(Area, related_name="subjects", on_delete=models.CASCADE)

    def __str__(self) -> str:
        return self.name


class AcademicLoad(models.Model):
    subject = models.ForeignKey(Subject, related_name="academic_loads", on_delete=models.CASCADE)
    grade = models.ForeignKey(Grade, related_name="academic_loads", on_delete=models.CASCADE)
    weight_percentage = models.PositiveIntegerField(
        default=100, help_text="Percentage weight within the area"
    )
    hours_per_week = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("subject", "grade")
        verbose_name = "Carga Académica"
        verbose_name_plural = "Cargas Académicas"

    def __str__(self) -> str:
        return f"{self.subject.name} - {self.grade}"


class TeacherAssignment(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="assignments",
        on_delete=models.CASCADE,
        limit_choices_to={"role": "TEACHER"},
    )
    academic_load = models.ForeignKey(
        AcademicLoad, related_name="assignments", on_delete=models.CASCADE, null=True
    )
    group = models.ForeignKey(
        Group, related_name="assignments", on_delete=models.CASCADE
    )
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE)

    class Meta:
        # A subject in a group can only be assigned to one teacher per year
        unique_together = ("academic_load", "group", "academic_year")

    def __str__(self) -> str:
        return f"{self.teacher} - {self.academic_load} - {self.group}"


class EvaluationScale(models.Model):
    SCALE_TYPES = (
        ('NUMERIC', 'Numérica (Básica/Media)'),
        ('QUALITATIVE', 'Cualitativa (Preescolar)'),
    )
    academic_year = models.ForeignKey(
        AcademicYear, related_name="evaluation_scales", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=50)  # e.g. "Superior", "Alto"
    min_score = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    scale_type = models.CharField(max_length=20, choices=SCALE_TYPES, default='NUMERIC')

    def __str__(self) -> str:
        if self.scale_type == 'NUMERIC':
            return f"{self.name} ({self.min_score} - {self.max_score})"
        return self.name


class Dimension(models.Model):
    """
    Dimensiones de Evaluación: Categorías institucionales para agrupar notas (ej. Cognitivo, Procedimental, Actitudinal).
    Tienen un porcentaje definido institucionalmente por año lectivo.
    """
    academic_year = models.ForeignKey(AcademicYear, related_name="dimensions", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    percentage = models.PositiveIntegerField(default=0, verbose_name="Porcentaje", help_text="Peso porcentual en la nota definitiva")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['academic_year', 'name']
        verbose_name = "Dimensión"
        verbose_name_plural = "Dimensiones"

    def __str__(self):
        return f"{self.name} ({self.percentage}%)"


class EvaluationComponent(models.Model):
    academic_load = models.ForeignKey(
        AcademicLoad, related_name="components", on_delete=models.CASCADE, null=True
    )
    name = models.CharField(max_length=50)  # e.g. "Saber", "Hacer", "Ser"
    weight_percentage = models.PositiveIntegerField(
        help_text="Percentage weight within the subject"
    )

    def __str__(self) -> str:
        return f"{self.name} ({self.weight_percentage}%) - {self.academic_load}"


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


class AchievementDefinition(models.Model):
    """
    Banco de Logros: Definiciones reutilizables de logros.
    Pueden estar asociados a un Área (general) o a una Asignatura (específico).
    """
    code = models.CharField(max_length=20, unique=True, blank=True, help_text="Código interno del logro (ej. CN-001)")
    description = models.TextField(verbose_name="Descripción del Logro")
    area = models.ForeignKey(Area, related_name="achievement_definitions", on_delete=models.SET_NULL, null=True, blank=True)
    grade = models.ForeignKey(Grade, related_name="achievement_definitions", on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.ForeignKey(Subject, related_name="achievement_definitions", on_delete=models.SET_NULL, null=True, blank=True)
    academic_load = models.ForeignKey(AcademicLoad, related_name="achievement_definitions", on_delete=models.SET_NULL, null=True, blank=True)
    dimension = models.ForeignKey(Dimension, related_name="achievement_definitions", on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if not self.code:
            # Generar código único basado en el ID autoincremental.
            # Primero guardamos con un código temporal para obtener el ID.
            self.code = f"TEMP-{uuid.uuid4().hex[:8]}"
            super().save(*args, **kwargs)
            
            # Una vez guardado, tenemos self.id
            self.code = f"LOG-{self.id:04d}"
            # Guardamos de nuevo solo el campo code
            super().save(update_fields=['code'])
        else:
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.description[:50]}..."

    class Meta:
        verbose_name = "Banco de Logros"
        verbose_name_plural = "Banco de Logros"


class Achievement(models.Model):
    """
    Logro Planificado: Instancia de un logro para un periodo y asignatura específicos.
    """
    academic_load = models.ForeignKey(
        AcademicLoad, related_name="achievements", on_delete=models.CASCADE, null=True
    )
    subject = models.ForeignKey(Subject, related_name="achievements", on_delete=models.CASCADE, null=True, blank=True)
    group = models.ForeignKey(Group, related_name="achievements", on_delete=models.CASCADE, null=True, blank=True)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    dimension = models.ForeignKey(Dimension, related_name="achievements", on_delete=models.PROTECT, null=True, blank=True)
    definition = models.ForeignKey(AchievementDefinition, related_name="instances", on_delete=models.SET_NULL, null=True, blank=True)
    description = models.TextField(help_text="Descripción específica para este periodo (puede heredar del banco)")
    percentage = models.PositiveIntegerField(default=0, help_text="Porcentaje de valoración si aplica")

    def __str__(self) -> str:
        return f"{self.academic_load} - {self.period}: {self.description[:50]}..."

    class Meta:
        verbose_name = "Logro Planificado"
        verbose_name_plural = "Logros Planificados"


class PerformanceIndicator(models.Model):
    """
    Indicadores de Desempeño: Descriptores para cada nivel de desempeño asociados a un logro.
    """
    LEVEL_CHOICES = (
        ('LOW', 'Bajo'),
        ('BASIC', 'Básico'),
        ('HIGH', 'Alto'),
        ('SUPERIOR', 'Superior'),
    )
    achievement = models.ForeignKey(Achievement, related_name="indicators", on_delete=models.CASCADE)
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    description = models.TextField()

    class Meta:
        unique_together = ('achievement', 'level')
        verbose_name = "Indicador de Desempeño"
        verbose_name_plural = "Indicadores de Desempeño"

    def __str__(self):
        return f"{self.get_level_display()} - {self.achievement}"


class GradeSheet(models.Model):
    STATUS_DRAFT = "DRAFT"
    STATUS_PUBLISHED = "PUBLISHED"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Borrador"),
        (STATUS_PUBLISHED, "Publicado"),
    )

    teacher_assignment = models.ForeignKey(
        TeacherAssignment, related_name="grade_sheets", on_delete=models.CASCADE
    )
    period = models.ForeignKey(Period, related_name="grade_sheets", on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["teacher_assignment", "period"], name="uniq_grade_sheet_assignment_period"
            )
        ]
        indexes = [
            models.Index(fields=["teacher_assignment", "period"], name="idx_gradesheet_assign_period"),
            models.Index(fields=["period"], name="idx_gradesheet_period"),
        ]
        verbose_name = "Planilla de Calificaciones"
        verbose_name_plural = "Planillas de Calificaciones"

    def __str__(self) -> str:
        return f"{self.teacher_assignment} - {self.period} ({self.status})"


class AchievementGrade(models.Model):
    gradesheet = models.ForeignKey(
        GradeSheet, related_name="achievement_grades", on_delete=models.CASCADE
    )
    enrollment = models.ForeignKey(
        "students.Enrollment", related_name="achievement_grades", on_delete=models.CASCADE
    )
    achievement = models.ForeignKey(
        Achievement, related_name="achievement_grades", on_delete=models.CASCADE
    )
    score = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["gradesheet", "enrollment", "achievement"],
                name="uniq_achievement_grade_cell",
            )
        ]
        indexes = [
            models.Index(fields=["gradesheet", "enrollment"], name="idx_achgrade_sheet_enr"),
            models.Index(fields=["gradesheet", "achievement"], name="idx_achgrade_sheet_ach"),
            models.Index(fields=["enrollment"], name="idx_achgrade_enrollment"),
        ]
        verbose_name = "Nota por Logro"
        verbose_name_plural = "Notas por Logro"

    def __str__(self) -> str:
        return f"{self.enrollment} - {self.achievement}: {self.score}"

