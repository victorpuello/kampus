from django.conf import settings
from django.db import models


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True
    )
    # Identification
    document_type = models.CharField(max_length=20, blank=True)
    document_number = models.CharField(max_length=50, blank=True, unique=True, verbose_name="Número de documento")
    place_of_issue = models.CharField(max_length=100, blank=True, verbose_name="Lugar de expedición")
    nationality = models.CharField(max_length=50, blank=True, default="Colombiana")
    birth_date = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=1, choices=(('M', 'Masculino'), ('F', 'Femenino')), blank=True)
    blood_type = models.CharField(max_length=5, blank=True)
    
    # Residence & Contact
    address = models.CharField(max_length=255, blank=True)
    neighborhood = models.CharField(max_length=100, blank=True, verbose_name="Barrio/Vereda")
    phone = models.CharField(max_length=20, blank=True)
    living_with = models.CharField(max_length=200, blank=True, verbose_name="Con quién vive")
    stratum = models.CharField(max_length=2, blank=True, verbose_name="Estrato")
    
    # Socioeconomic
    ethnicity = models.CharField(max_length=100, blank=True)
    sisben_score = models.CharField(max_length=20, blank=True, verbose_name="SISBÉN")
    eps = models.CharField(max_length=100, blank=True)
    is_victim_of_conflict = models.BooleanField(default=False, verbose_name="Víctima del conflicto")
    
    # Disability & Support
    has_disability = models.BooleanField(default=False, verbose_name="Tiene discapacidad")
    disability_description = models.TextField(blank=True, verbose_name="Descripción discapacidad")
    disability_type = models.CharField(max_length=100, blank=True, verbose_name="Tipo de discapacidad")
    support_needs = models.TextField(blank=True, verbose_name="Apoyos requeridos")

    # Health & Emergency
    allergies = models.TextField(blank=True, verbose_name="Alergias/Restricciones")
    emergency_contact_name = models.CharField(max_length=200, blank=True, verbose_name="Nombre Contacto Emergencia")
    emergency_contact_phone = models.CharField(max_length=50, blank=True, verbose_name="Teléfono Emergencia")
    emergency_contact_relationship = models.CharField(max_length=50, blank=True, verbose_name="Parentesco Emergencia")

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
    document_number = models.CharField(max_length=50, blank=True, verbose_name="Cédula")
    relationship = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    is_main_guardian = models.BooleanField(default=False)
    is_head_of_household = models.BooleanField(default=False, verbose_name="Cabeza de familia")

    def __str__(self) -> str:
        return f"{self.full_name} - {self.relationship}"


class Enrollment(models.Model):
    from academic.models import AcademicYear, Grade, Group
    from core.models import Campus

    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE)
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE)
    group = models.ForeignKey(Group, on_delete=models.SET_NULL, null=True, blank=True)
    campus = models.ForeignKey(Campus, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=(
            ("ACTIVE", "Activo"),
            ("RETIRED", "Retirado"),
            ("GRADUATED", "Graduado"),
        ),
        default="ACTIVE",
    )
    origin_school = models.CharField(max_length=200, blank=True, verbose_name="Procedencia")
    final_status = models.CharField(max_length=50, blank=True, verbose_name="Promoción")

    class Meta:
        unique_together = ("student", "academic_year")

    def __str__(self) -> str:
        return f"{self.student} - {self.academic_year} - {self.grade}"


class StudentNovelty(models.Model):
    NOVELTY_TYPES = (
        ("INGRESO", "Ingreso"),
        ("RETIRO", "Retiro"),
        ("REINGRESO", "Reingreso"),
        ("OTRO", "Otro"),
    )
    student = models.ForeignKey(
        Student, related_name="novelties", on_delete=models.CASCADE
    )
    novelty_type = models.CharField(max_length=20, choices=NOVELTY_TYPES)
    date = models.DateField()
    observation = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.get_novelty_type_display()} - {self.student} ({self.date})"


class StudentDocument(models.Model):
    DOCUMENT_TYPES = (
        ('IDENTITY', 'Documento de Identidad'),
        ('VACCINES', 'Carnet de Vacunas'),
        ('EPS', 'Certificado EPS'),
        ('ACADEMIC', 'Certificado Académico Anterior'),
        ('PHOTO', 'Foto Tipo Documento'),
        ('OTHER', 'Otro'),
    )
    student = models.ForeignKey(Student, related_name='documents', on_delete=models.CASCADE)
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    file = models.FileField(upload_to='student_documents/')
    description = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_document_type_display()} - {self.student}"
