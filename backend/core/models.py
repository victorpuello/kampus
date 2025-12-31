from django.db import models
from django.conf import settings

class Institution(models.Model):
    name = models.CharField(max_length=200, verbose_name="Nombre Institución")
    dane_code = models.CharField(max_length=50, blank=True, verbose_name="Código DANE")
    nit = models.CharField(max_length=50, blank=True, verbose_name="NIT")
    address = models.CharField(max_length=255, blank=True, verbose_name="Dirección Principal")
    phone = models.CharField(max_length=50, blank=True, verbose_name="Teléfono")
    email = models.EmailField(blank=True, verbose_name="Correo Electrónico")
    website = models.URLField(blank=True, verbose_name="Sitio Web")
    logo = models.ImageField(upload_to='institutions/logos/', blank=True, null=True, verbose_name="Escudo/Logo")

    # PDF report letterhead (membrete)
    pdf_letterhead_image = models.ImageField(
        upload_to='institutions/letterheads/',
        blank=True,
        null=True,
        verbose_name="Imagen de membrete (PDF)",
        help_text="Si se define, se usa como encabezado del PDF (ancho completo).",
    )
    pdf_show_logo = models.BooleanField(
        default=True,
        verbose_name="Mostrar escudo/logo en PDFs",
    )
    pdf_logo_height_px = models.PositiveSmallIntegerField(
        default=60,
        verbose_name="Alto del logo en PDFs (px)",
    )
    pdf_header_line1 = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Encabezado PDF - Línea 1",
        help_text="Si está vacío, se usa el nombre de la institución.",
    )
    pdf_header_line2 = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Encabezado PDF - Línea 2",
        help_text="Opcional (ej: lema, sede, etc.).",
    )
    pdf_header_line3 = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Encabezado PDF - Línea 3",
        help_text="Opcional (ej: municipio/departamento).",
    )
    pdf_footer_text = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Pie de página PDF",
        help_text="Texto opcional que aparece en el pie del PDF.",
    )
    
    rector = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        related_name="managed_institutions", 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        verbose_name="Rector",
        limit_choices_to={'role__in': ['ADMIN', 'TEACHER']}
    )
    
    secretary = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        related_name="secretary_institutions", 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        verbose_name="Secretario/a",
        limit_choices_to={'role': 'SECRETARY'}
    )
    
    def __str__(self):
        return self.name


class Campus(models.Model):
    # Choices para tipos de sede
    SEDE_TYPE_CHOICES = [
        ('PRINCIPAL', 'Principal'),
        ('ANEXA', 'Anexa'),
        ('RURAL_DISPERSA', 'Rural Dispersa'),
        ('URBANA', 'Urbana'),
    ]
    
    # Choices para estado de sede
    SEDE_STATUS_CHOICES = [
        ('ACTIVA', 'Activa'),
        ('CERRADA', 'Cerrada'),
        ('EN_REAPERTURA', 'En Reapertura'),
    ]
    
    # Choices para carácter académico
    CHARACTER_CHOICES = [
        ('ACADEMICA', 'Académica'),
        ('TECNICA', 'Técnica'),
        ('TECNICA_ACADEMICA', 'Técnica y Académica'),
    ]
    
    # Choices para especialidad
    SPECIALTY_CHOICES = [
        ('ACADEMICO', 'Académico'),
        ('TECNICO', 'Técnico'),
        ('ARTISTICO', 'Artístico'),
        ('COMERCIAL', 'Comercial'),
        ('INDUSTRIAL', 'Industrial'),
        ('AGROPECUARIO', 'Agropecuario'),
        ('PEDAGOGICO', 'Pedagógico'),
    ]
    
    # Choices para metodología
    METHODOLOGY_CHOICES = [
        ('TRADICIONAL', 'Tradicional'),
        ('ESCUELA_NUEVA', 'Escuela Nueva'),
        ('ACELERACION', 'Aceleración del Aprendizaje'),
        ('POST_PRIMARIA', 'Post Primaria'),
        ('TELESECUNDARIA', 'Telesecundaria'),
        ('SAT', 'SAT'),
        ('CAFAM', 'CAFAM'),
        ('A_CRECER', 'A Crecer'),
    ]
    
    # Choices para zona
    ZONE_CHOICES = [
        ('URBANA', 'Urbana'),
        ('RURAL', 'Rural'),
    ]
    
    # Choices para niveles educativos
    LEVEL_CHOICES = [
        ('PREESCOLAR', 'Preescolar'),
        ('BASICA_PRIMARIA', 'Básica Primaria'),
        ('BASICA_SECUNDARIA', 'Básica Secundaria'),
        ('MEDIA', 'Media'),
    ]
    
    # Choices para jornadas
    SHIFT_CHOICES = [
        ('MANANA', 'Mañana'),
        ('TARDE', 'Tarde'),
        ('NOCHE', 'Noche'),
        ('UNICA', 'Única'),
        ('FIN_SEMANA', 'Fin de Semana'),
    ]
    
    # Choices para calendario
    CALENDAR_CHOICES = [
        ('A', 'Calendario A'),
        ('B', 'Calendario B'),
    ]

    # === 1. Identificación de la sede ===
    institution = models.ForeignKey(Institution, related_name="campuses", on_delete=models.CASCADE, verbose_name="Institución")
    dane_code = models.CharField(max_length=50, blank=True, default='', verbose_name="Código DANE Actual")
    dane_code_previous = models.CharField(max_length=50, blank=True, default='', verbose_name="Código DANE Anterior")
    sede_number = models.CharField(max_length=10, blank=True, default='01', verbose_name="Número de Sede", help_text="Ej: 01, 02, 03...")
    nit = models.CharField(max_length=50, blank=True, default='', verbose_name="NIT")
    name = models.CharField(max_length=200, verbose_name="Nombre de la Sede")
    sede_type = models.CharField(max_length=20, choices=SEDE_TYPE_CHOICES, default='PRINCIPAL', verbose_name="Tipo de Sede")
    status = models.CharField(max_length=20, choices=SEDE_STATUS_CHOICES, default='ACTIVA', verbose_name="Estado de la Sede")
    
    # === 2. Normatividad y características académicas ===
    resolution_number = models.CharField(max_length=100, blank=True, default='', verbose_name="Número de Resolución de Aprobación")
    resolution_date = models.DateField(null=True, blank=True, verbose_name="Fecha de Resolución")
    character = models.CharField(max_length=20, choices=CHARACTER_CHOICES, default='ACADEMICA', verbose_name="Carácter")
    specialty = models.CharField(max_length=20, choices=SPECIALTY_CHOICES, default='ACADEMICO', verbose_name="Especialidad")
    methodology = models.CharField(max_length=20, choices=METHODOLOGY_CHOICES, default='TRADICIONAL', verbose_name="Metodología")
    
    # === 3. Ubicación ===
    department = models.CharField(max_length=100, blank=True, default='', verbose_name="Departamento")
    municipality = models.CharField(max_length=100, blank=True, default='', verbose_name="Municipio")
    zone = models.CharField(max_length=10, choices=ZONE_CHOICES, default='URBANA', verbose_name="Zona")
    neighborhood = models.CharField(max_length=200, blank=True, default='', verbose_name="Vereda o Barrio")
    address = models.CharField(max_length=255, blank=True, default='', verbose_name="Dirección")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, verbose_name="Latitud")
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, verbose_name="Longitud")
    
    # === 4. Oferta educativa ===
    levels = models.JSONField(default=list, verbose_name="Niveles que Ofrece", help_text="Lista de niveles: PREESCOLAR, BASICA_PRIMARIA, BASICA_SECUNDARIA, MEDIA")
    shifts = models.JSONField(default=list, verbose_name="Jornadas", help_text="Lista de jornadas: MANANA, TARDE, NOCHE, UNICA, FIN_SEMANA")
    calendar = models.CharField(max_length=1, choices=CALENDAR_CHOICES, default='A', verbose_name="Calendario")
    
    # === 5. Contacto ===
    phone = models.CharField(max_length=50, blank=True, default='', verbose_name="Teléfono Fijo")
    mobile = models.CharField(max_length=50, blank=True, default='', verbose_name="Celular de Contacto")
    email = models.EmailField(blank=True, default='', verbose_name="Correo Institucional de Sede")
    other_contact = models.CharField(max_length=200, blank=True, default='', verbose_name="Otro Medio de Contacto")
    
    # === 6. Responsables ===
    director = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="directed_campuses",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Rector(a) o Director(a)",
        limit_choices_to={'role__in': ['ADMIN', 'TEACHER']}
    )
    campus_secretary = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="secretary_campuses",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Secretario(a)",
        limit_choices_to={'role': 'SECRETARY'}
    )
    coordinator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="coordinated_campuses",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Coordinador(a)",
        limit_choices_to={'role': 'COORDINATOR'}
    )
    
    # Campo legacy para compatibilidad
    is_main = models.BooleanField(default=False, verbose_name="Es Sede Principal")
    
    class Meta:
        verbose_name = "Sede"
        verbose_name_plural = "Sedes"
        ordering = ['sede_number', 'name']
        
    def __str__(self):
        return f"{self.sede_number} - {self.name} ({self.institution.name})"
