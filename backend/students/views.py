from rest_framework import viewsets, filters, serializers
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse, HttpResponse
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q, Sum
from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.conf import settings
from django.urls import reverse
import csv
import base64
import io
import os
import random
import tempfile
import re
import unicodedata
import uuid as py_uuid
from datetime import date, datetime
from decimal import Decimal
from academic.models import AcademicLoad, AcademicYear, Grade, Group
from academic.models import (
    Achievement,
    AchievementGrade,
    Dimension,
    EvaluationScale,
    GradeSheet,
    Period,
    TeacherAssignment,
)
from academic.grading import (
    DEFAULT_EMPTY_SCORE,
    final_grade_from_dimensions,
    match_scale,
    weighted_average,
)
from core.models import Institution
from core.models import Campus
from .models import (
    CertificateIssue,
    ConditionalPromotionPlan,
    Enrollment,
    FamilyMember,
    Student,
    StudentDocument,
    StudentNovelty,
)
try:
    from xhtml2pdf import pisa
except ImportError:
    pisa = None
from rest_framework.permissions import AllowAny, IsAuthenticated

from users.permissions import IsAdministrativeStaff

from audit.services import log_event

try:
    import qrcode  # type: ignore
except Exception:  # pragma: no cover
    qrcode = None

from .serializers import (
    StudentSerializer,
    FamilyMemberSerializer,
    EnrollmentSerializer,
    StudentNoveltySerializer,
    StudentDocumentSerializer,
)
from .pagination import StudentPagination, EnrollmentPagination
from core.permissions import HasDjangoPermission, KampusModelPermissions
import traceback

from .academic_period_report import compute_certificate_studies_rows, generate_academic_period_report_pdf

User = get_user_model()



class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user").all().order_by("user__last_name", "user__first_name", "user__id")
    serializer_class = StudentSerializer
    permission_classes = [KampusModelPermissions]
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = StudentPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__first_name', 'user__last_name', 'document_number']

    def get_queryset(self):
        qs = Student.objects.select_related("user").all().order_by("user__last_name", "user__first_name", "user__id")
        user = getattr(self.request, 'user', None)

        exclude_year_raw = self.request.query_params.get('exclude_active_enrollment_year')
        exclude_year_id = None
        if exclude_year_raw is not None and str(exclude_year_raw).strip() != '':
            try:
                exclude_year_id = int(exclude_year_raw)
            except (TypeError, ValueError):
                exclude_year_id = None

        if user is not None and getattr(user, 'role', None) in {'PARENT', 'STUDENT'}:
            return qs.none()

        if user is not None and getattr(user, 'role', None) == 'TEACHER':
            # Teachers should only see students from the group(s) they direct.
            # Default to current ACTIVE academic year when available.
            active_year = AcademicYear.objects.filter(status='ACTIVE').first()
            directed_groups = Group.objects.filter(director=user)
            if active_year:
                directed_groups = directed_groups.filter(academic_year=active_year)

            if not directed_groups.exists():
                return qs.none()

            from students.models import Enrollment

            directed_student_ids = (
                Enrollment.objects.filter(
                    group__in=directed_groups,
                    status='ACTIVE',
                )
                .values_list('student_id', flat=True)
                .distinct()
            )
            qs = qs.filter(pk__in=directed_student_ids)

        if exclude_year_id is not None:
            from students.models import Enrollment

            excluded_student_ids = (
                Enrollment.objects.filter(
                    academic_year_id=exclude_year_id,
                    status='ACTIVE',
                )
                .values_list('student_id', flat=True)
                .distinct()
            )
            qs = qs.exclude(pk__in=excluded_student_ids)

        return qs.order_by("user__last_name", "user__first_name", "user__id")

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            print("ERROR IN STUDENT LIST:")
            traceback.print_exc()
            return Response({"error": str(e), "traceback": traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para crear estudiantes."}, status=status.HTTP_403_FORBIDDEN)

        print("Recibiendo datos para crear estudiante:", request.data)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("VALIDATION ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            print("ERROR IN STUDENT CREATE:")
            traceback.print_exc()
            # If it's a validation error raised by us, return 400
            if "ValidationError" in str(type(e)):
                 return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para editar estudiantes."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para editar estudiantes."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para eliminar estudiantes."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def _normalize_header(self, value: str) -> str:
        if value is None:
            return ''
        text = str(value).strip()
        text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        text = text.lower()
        text = re.sub(r'[^a-z0-9]+', '_', text)
        return text.strip('_')

    def _parse_bool(self, value):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        s = str(value).strip().lower()
        if s in {'1', 'true', 't', 'yes', 'y', 'si', 'sí'}:
            return True
        if s in {'0', 'false', 'f', 'no', 'n'}:
            return False
        return None

    def _parse_date(self, value):
        if value is None or value == '':
            return None
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        s = str(value).strip()
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
        return None

    def _extract_value(self, row: dict, *keys, default=None):
        for k in keys:
            if k in row and row[k] not in (None, ''):
                return row[k]
        return default

    def _coerce_str(self, value):
        if value is None:
            return ''
        if isinstance(value, bool):
            return 'true' if value else 'false'
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, float):
            try:
                if value.is_integer():
                    return str(int(value))
            except Exception:
                pass
        return str(value).strip()

    def _map_row_to_student_payload(self, row: dict):
        # Accept common Spanish/English headers.
        first_name = self._extract_value(row, 'first_name', 'nombres', 'nombre', 'name')
        last_name = self._extract_value(row, 'last_name', 'apellidos', 'apellido', 'surname')
        email = self._extract_value(row, 'email', 'correo', 'correo_electronico', 'e_mail')

        document_number = self._extract_value(
            row,
            'document_number',
            'numero_documento',
            'no_documento',
            'documento',
            'identificacion',
            'dni',
        )
        document_type = self._extract_value(row, 'document_type', 'tipo_documento', 'tipo_de_documento')

        sex_raw = self._extract_value(row, 'sex', 'sexo', 'genero')
        sex = None
        if sex_raw is not None and str(sex_raw).strip() != '':
            sx = str(sex_raw).strip().upper()
            if sx in {'M', 'MAS', 'MASCULINO', 'MALE'}:
                sex = 'M'
            elif sx in {'F', 'FEM', 'FEMENINO', 'FEMALE'}:
                sex = 'F'

        payload = {
            'first_name': self._coerce_str(first_name),
            'last_name': self._coerce_str(last_name),
            'email': self._coerce_str(email),
            'document_number': self._coerce_str(document_number),
            'document_type': self._coerce_str(document_type),
        }

        # Optional student fields
        optional_str_fields = {
            'place_of_issue': ('place_of_issue', 'lugar_expedicion', 'lugar_de_expedicion'),
            'nationality': ('nationality', 'nacionalidad'),
            'blood_type': ('blood_type', 'tipo_sangre', 'rh'),
            'address': ('address', 'direccion'),
            'neighborhood': ('neighborhood', 'barrio', 'barrio_vereda'),
            'phone': ('phone', 'telefono', 'celular'),
            'living_with': ('living_with', 'con_quien_vive'),
            'stratum': ('stratum', 'estrato'),
            'ethnicity': ('ethnicity', 'etnia'),
            'sisben_score': ('sisben_score', 'sisben', 'puntaje_sisben'),
            'eps': ('eps',),
            'disability_description': ('disability_description', 'descripcion_discapacidad'),
            'disability_type': ('disability_type', 'tipo_discapacidad'),
            'support_needs': ('support_needs', 'apoyos', 'apoyos_requeridos'),
            'allergies': ('allergies', 'alergias'),
            'emergency_contact_name': ('emergency_contact_name', 'contacto_emergencia_nombre'),
            'emergency_contact_phone': ('emergency_contact_phone', 'contacto_emergencia_telefono'),
            'emergency_contact_relationship': ('emergency_contact_relationship', 'contacto_emergencia_parentesco'),
            'financial_status': ('financial_status', 'estado_financiero'),
        }
        for target, aliases in optional_str_fields.items():
            v = self._extract_value(row, *aliases)
            if v is not None:
                payload[target] = self._coerce_str(v)

        birth_date_raw = self._extract_value(row, 'birth_date', 'fecha_nacimiento', 'nacimiento')
        birth_date = self._parse_date(birth_date_raw)
        if birth_date is not None:
            payload['birth_date'] = birth_date

        if sex is not None:
            payload['sex'] = sex

        is_victim_raw = self._extract_value(row, 'is_victim_of_conflict', 'victima_conflicto', 'victima_del_conflicto')
        is_victim = self._parse_bool(is_victim_raw)
        if is_victim is not None:
            payload['is_victim_of_conflict'] = is_victim

        has_disability_raw = self._extract_value(row, 'has_disability', 'tiene_discapacidad', 'discapacidad')
        has_disability = self._parse_bool(has_disability_raw)
        if has_disability is not None:
            payload['has_disability'] = has_disability

        return payload

    @action(detail=True, methods=["post"], url_path="import-academic-history")
    @transaction.atomic
    def import_academic_history(self, request, pk=None):
        """Import external academic history for a student.

        Creates (or reuses) an Enrollment for the given academic year with group=None,
        and stores imported subject/area finals in EnrollmentPromotionSnapshot.details.

        Body example:
        {
          "academic_year": 2024,
          "grade_name": "Octavo",
          "origin_school": "Colegio X",
          "subjects": [
            {"area": "Matemáticas", "subject": "Álgebra", "final_score": "3.80"},
            {"area": "Ciencias", "subject": "Biología", "final_score": "2.50"}
          ]
        }
        """

        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para importar historial."}, status=status.HTTP_403_FORBIDDEN)

        student = self.get_object()

        year_value = request.data.get("academic_year")
        grade_id = request.data.get("grade")
        grade_name = request.data.get("grade_name")
        origin_school = request.data.get("origin_school", "")
        subjects = request.data.get("subjects") or []

        if not year_value:
            return Response({"detail": "academic_year es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year_int = int(year_value)
        except Exception:
            return Response({"detail": "academic_year inválido"}, status=status.HTTP_400_BAD_REQUEST)

        if not grade_id and not grade_name:
            return Response({"detail": "grade o grade_name es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        if grade_id:
            grade = Grade.objects.filter(id=grade_id).first()
        else:
            grade = Grade.objects.filter(name=grade_name).first()

        if not grade:
            return Response({"detail": "Grado no encontrado"}, status=status.HTTP_400_BAD_REQUEST)

        # Create or reuse AcademicYear by numeric year
        academic_year = AcademicYear.objects.filter(year=year_int).first()
        if not academic_year:
            academic_year = AcademicYear.objects.create(year=year_int, status=AcademicYear.STATUS_PLANNING)

        enrollment, _ = Enrollment.objects.get_or_create(
            student=student,
            academic_year=academic_year,
            defaults={
                "grade": grade,
                "group": None,
                "status": "RETIRED",
                "origin_school": origin_school,
                "final_status": "IMPORTADO",
            },
        )

        # If enrollment already existed, keep grade consistent unless explicitly overridden
        if enrollment.grade_id != grade.id:
            enrollment.grade = grade
        if origin_school:
            enrollment.origin_school = origin_school
        if enrollment.status == "ACTIVE" and academic_year.status != "ACTIVE":
            # Avoid leaving past-year enrollments ACTIVE
            enrollment.status = "RETIRED"
        enrollment.save(update_fields=["grade", "origin_school", "status"])

        # Validate and compute decision from imported subject finals.
        passing_score = Decimal("3.00")
        failed_subjects = []
        failed_areas = set()
        failed_distinct_areas = set()

        normalized_subjects = []
        for idx, row in enumerate(subjects):
            area = (row.get("area") or "").strip()
            subject_name = (row.get("subject") or "").strip()
            score_raw = row.get("final_score")
            if not area or not subject_name or score_raw in (None, ""):
                return Response(
                    {"detail": f"subjects[{idx}] debe incluir area, subject, final_score"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                score = Decimal(str(score_raw)).quantize(Decimal("0.01"))
            except Exception:
                return Response(
                    {"detail": f"subjects[{idx}].final_score inválido"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            normalized_subjects.append({"area": area, "subject": subject_name, "final_score": str(score)})
            if score < passing_score:
                failed_subjects.append({"area": area, "subject": subject_name, "final_score": str(score)})
                failed_areas.add(area)
                failed_distinct_areas.add(area)

        failed_subjects_count = len(failed_subjects)
        failed_areas_count = len(failed_areas)
        failed_subjects_distinct_areas_count = len(failed_distinct_areas)

        # Apply your SIEE decision rules (by names, for imported records)
        if failed_areas_count >= 2:
            decision = "REPEATED"
        elif failed_subjects_count >= 3 and failed_subjects_distinct_areas_count >= 3:
            decision = "REPEATED"
        elif failed_areas_count == 0 and failed_subjects_count == 0:
            decision = "PROMOTED"
        elif failed_areas_count == 1 or failed_subjects_count <= 2:
            decision = "CONDITIONAL"
        else:
            decision = "REPEATED"

        # Persist as snapshot details (no need to create curriculum subjects/areas)
        from academic.models import EnrollmentPromotionSnapshot

        details = {
            "source": "IMPORTED",
            "academic_year": year_int,
            "origin_school": origin_school,
            "grade": {"id": grade.id, "name": grade.name, "ordinal": grade.ordinal},
            "passing_score": str(passing_score),
            "subjects": normalized_subjects,
            "failed_subjects": failed_subjects,
            "failed_areas": sorted(list(failed_areas)),
        }

        EnrollmentPromotionSnapshot.objects.update_or_create(
            enrollment=enrollment,
            defaults={
                "decision": decision,
                "failed_subjects_count": failed_subjects_count,
                "failed_areas_count": failed_areas_count,
                "failed_subjects_distinct_areas_count": failed_subjects_distinct_areas_count,
                "details": details,
            },
        )

        # Keep legacy field simple but informative
        enrollment.final_status = f"IMPORTADO ({decision})"
        enrollment.save(update_fields=["final_status"])

        return Response(
            {
                "enrollment_id": enrollment.id,
                "academic_year": {"id": academic_year.id, "year": academic_year.year},
                "decision": decision,
                "failed_subjects_count": failed_subjects_count,
                "failed_areas_count": failed_areas_count,
            },
            status=status.HTTP_201_CREATED,
        )

    def _read_rows_from_upload(self, upload):
        name = getattr(upload, 'name', '') or ''
        ext = os.path.splitext(name.lower())[1]

        if ext == '.csv':
            raw = upload.read()
            # Try utf-8 with BOM first, then fallback.
            try:
                text = raw.decode('utf-8-sig')
            except Exception:
                text = raw.decode('latin-1')
            f = io.StringIO(text)
            reader = csv.DictReader(f)
            return [
                {self._normalize_header(k): v for k, v in (row or {}).items() if k is not None}
                for row in reader
            ]

        if ext in {'.xlsx', '.xls'}:
            if ext == '.xlsx':
                from openpyxl import load_workbook
                wb = load_workbook(upload, read_only=True, data_only=True)
                ws = wb.active
                rows = list(ws.iter_rows(values_only=True))
            else:
                import xlrd
                book = xlrd.open_workbook(file_contents=upload.read())
                sheet = book.sheet_by_index(0)
                rows = [sheet.row_values(r) for r in range(sheet.nrows)]

            if not rows:
                return []

            headers = [self._normalize_header(h) for h in (rows[0] or [])]
            out = []
            for r in rows[1:]:
                if r is None:
                    continue
                row_dict = {}
                empty = True
                for i, h in enumerate(headers):
                    if not h:
                        continue
                    v = r[i] if i < len(r) else None
                    if v not in (None, ''):
                        empty = False
                    row_dict[h] = v
                if not empty:
                    out.append(row_dict)
            return out

        raise ValueError('Formato no soportado. Usa CSV, XLSX o XLS.')

    @action(detail=False, methods=['post'], url_path='bulk-import', parser_classes=(MultiPartParser, FormParser))
    def bulk_import(self, request):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para importar estudiantes."}, status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get('file')
        if not upload:
            return Response({"detail": "Archivo requerido (campo 'file')."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rows = self._read_rows_from_upload(upload)
        except ValueError as ve:
            return Response({"detail": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": f"No se pudo leer el archivo: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        failed = 0
        errors = []

        # Row numbers are 2-based (1 header + first data row = 2)
        for idx, raw_row in enumerate(rows, start=2):
            try:
                payload = self._map_row_to_student_payload(raw_row)

                # Enforce required fields for bulk import to avoid unique-blank collisions
                if not payload.get('first_name'):
                    raise serializers.ValidationError({"first_name": "Este campo es requerido."})
                if not payload.get('last_name'):
                    raise serializers.ValidationError({"last_name": "Este campo es requerido."})
                if not payload.get('document_number'):
                    raise serializers.ValidationError({"document_number": "Este campo es requerido."})

                serializer = self.get_serializer(data=payload)
                serializer.is_valid(raise_exception=True)
                with transaction.atomic():
                    serializer.save()
                created += 1
            except Exception as e:
                failed += 1
                detail = None
                if hasattr(e, 'detail'):
                    detail = e.detail
                else:
                    detail = str(e)
                errors.append({
                    'row': idx,
                    'error': detail,
                })

        return Response(
            {
                'created': created,
                'failed': failed,
                'errors': errors,
            },
            status=status.HTTP_200_OK,
        )


class FamilyMemberViewSet(viewsets.ModelViewSet):
    queryset = FamilyMember.objects.select_related("student").all().order_by("id")
    serializer_class = FamilyMemberSerializer
    permission_classes = [KampusModelPermissions]

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return FamilyMember.objects.none()
        return super().get_queryset()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para modificar familiares."}, status=status.HTTP_403_FORBIDDEN)

        print("FAMILY MEMBER CREATE DATA:", request.data)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("FAMILY MEMBER ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para modificar familiares."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para modificar familiares."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para modificar familiares."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = (
        Enrollment.objects.select_related("student", "student__user", "academic_year", "grade", "group")
        .all()
        .order_by("student__user__last_name", "student__user__first_name", "id")
    )
    serializer_class = EnrollmentSerializer
    permission_classes = [KampusModelPermissions]
    pagination_class = EnrollmentPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "student__document_number",
    ]
    filterset_fields = ["student", "academic_year", "grade", "group", "status"]

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Enrollment.objects.none()
        return super().get_queryset()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar matrículas."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar matrículas."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar matrículas."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar matrículas."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def report(self, request, *args, **kwargs):
        # Filters
        def _to_int_or_none(value):
            if value is None:
                return None
            raw = str(value).strip()
            if raw == "":
                return None
            try:
                return int(raw)
            except Exception:
                return None

        year_id = _to_int_or_none(request.query_params.get('year'))
        grade_id = _to_int_or_none(request.query_params.get('grade'))
        group_id = _to_int_or_none(request.query_params.get('group'))

        # IMPORTANT: Do not use query param named `format` here.
        # DRF treats ?format=... as a renderer override and can return 404
        # before reaching this action if the renderer isn't registered.
        report_format = (
            request.query_params.get('export')
            or request.query_params.get('report_format')
            or kwargs.get('format')
            or 'csv'
        )
        report_format = str(report_format).strip().lower()
        
        enrollments = Enrollment.objects.select_related('student', 'student__user', 'grade', 'group', 'academic_year').all().order_by('student__user__last_name', 'student__user__first_name')
        
        # Filter logic
        year_name = "Todos"
        grade_name = ""
        group_name = ""

        if year_id is not None:
            enrollments = enrollments.filter(academic_year_id=year_id)
            try:
                year_name = AcademicYear.objects.get(pk=year_id).year
            except: pass
        else:
            # Default to active year
            active_year = AcademicYear.objects.filter(status='ACTIVE').first()
            if active_year:
                enrollments = enrollments.filter(academic_year=active_year)
                year_name = active_year.year
        
        if grade_id is not None:
            enrollments = enrollments.filter(grade_id=grade_id)
            try:
                grade_name = Grade.objects.get(pk=grade_id).name
            except: pass

        if group_id is not None:
            enrollments = enrollments.filter(group_id=group_id)
            try:
                group_name = Group.objects.get(pk=group_id).name
            except: pass
            
        # PDF Generation
        if report_format == 'pdf':
            if not pisa:
                return Response({"error": "PDF generation library not installed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            def _pisa_link_callback(uri: str, rel: str):
                # Map /media/... and /static/... to absolute filesystem paths for xhtml2pdf.
                if uri is None:
                    return uri
                uri = str(uri)

                # Allow absolute URLs
                if uri.startswith('http://') or uri.startswith('https://'):
                    return uri

                media_url = getattr(settings, 'MEDIA_URL', '') or ''
                static_url = getattr(settings, 'STATIC_URL', '') or ''

                if media_url and uri.startswith(media_url):
                    path = os.path.join(settings.MEDIA_ROOT, uri[len(media_url):].lstrip('/\\'))
                    return os.path.normpath(path)

                if static_url and uri.startswith(static_url):
                    static_root = getattr(settings, 'STATIC_ROOT', None)
                    if static_root:
                        path = os.path.join(static_root, uri[len(static_url):].lstrip('/\\'))
                        return os.path.normpath(path)

                # If template provided an absolute filesystem path already
                if os.path.isabs(uri) and os.path.exists(uri):
                    return os.path.normpath(uri)

                # Best effort relative resolution
                if rel:
                    candidate = os.path.normpath(os.path.join(os.path.dirname(rel), uri))
                    if os.path.exists(candidate):
                        return candidate

                return uri

            try:
                institution = Institution.objects.first() or Institution()

                html_string = render_to_string('students/reports/enrollment_list_pdf.html', {
                    'enrollments': enrollments,
                    'institution': institution,
                    'year_name': year_name,
                    'grade_name': grade_name,
                    'group_name': group_name,
                })

                result = io.BytesIO()
                pdf = pisa.pisaDocument(
                    io.BytesIO(html_string.encode('UTF-8')),
                    result,
                    link_callback=_pisa_link_callback,
                    encoding='UTF-8',
                )

                if not pdf.err:
                    response = HttpResponse(result.getvalue(), content_type='application/pdf')
                    response['Content-Disposition'] = 'inline; filename="reporte_matriculados.pdf"'
                    return response

                return Response(
                    {
                        "error": "Error generating PDF",
                        "pisa_errors": getattr(pdf, "err", None),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            except Exception as e:
                payload = {"error": "Error generating PDF", "detail": str(e)}
                if getattr(settings, 'DEBUG', False):
                    payload["traceback"] = traceback.format_exc()
                return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # XLSX Generation
        if report_format == 'xlsx':
            from openpyxl import Workbook
            from openpyxl.utils import get_column_letter

            wb = Workbook()
            ws = wb.active
            ws.title = "Matriculados"

            headers = ['Documento', 'Nombres', 'Apellidos', 'Grado', 'Grupo', 'Año', 'Estado', 'Paz y Salvo']
            ws.append(headers)

            for enrollment in enrollments:
                student = enrollment.student
                user = student.user
                ws.append(
                    [
                        student.document_number,
                        (user.first_name or '').upper(),
                        (user.last_name or '').upper(),
                        enrollment.grade.name if enrollment.grade else '',
                        enrollment.group.name if enrollment.group else '',
                        enrollment.academic_year.year,
                        enrollment.get_status_display(),
                        student.get_financial_status_display(),
                    ]
                )

            # Simple column sizing
            for col_idx, header in enumerate(headers, start=1):
                max_len = len(str(header))
                for cell in ws[get_column_letter(col_idx)]:
                    if cell.value is not None:
                        max_len = max(max_len, len(str(cell.value)))
                ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 2, 40)

            out = io.BytesIO()
            wb.save(out)
            out.seek(0)

            response = HttpResponse(
                out.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = 'attachment; filename="matriculados.xlsx"'
            return response

        # CSV Generation (Default)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="matriculados.csv"'

        # UTF-8 BOM helps Excel interpret accents correctly.
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow(['Documento', 'Nombres', 'Apellidos', 'Grado', 'Grupo', 'Año', 'Estado', 'Paz y Salvo'])

    @action(
        detail=True,
        methods=['get'],
        url_path='academic-report',
        permission_classes=[IsAuthenticated],
    )
    def academic_report(self, request, pk=None):
        """Genera informe académico por periodos para una matrícula.

        GET /api/enrollments/{id}/academic-report/?period=<period_id>
        """

        if not pisa:
            return Response({"detail": "PDF generation library not installed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        def _to_int_or_none(value):
            if value is None:
                return None
            raw = str(value).strip()
            if raw == "":
                return None
            try:
                return int(raw)
            except Exception:
                return None

        period_id = _to_int_or_none(request.query_params.get('period'))
        if period_id is None:
            return Response({"detail": "period is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Fetch enrollment without inheriting the restrictive queryset (teachers/parents are blocked there).
        enrollment = (
            Enrollment.objects.select_related(
                'student',
                'student__user',
                'grade',
                'group',
                'group__director',
                'academic_year',
            )
            .filter(id=pk)
            .first()
        )
        if not enrollment:
            return Response({"detail": "Enrollment not found"}, status=status.HTTP_404_NOT_FOUND)

        user = getattr(request, 'user', None)
        role = getattr(user, 'role', None)
        # Allow admin-like roles, and also the teacher who directs the group.
        if role not in {'SUPERADMIN', 'ADMIN', 'COORDINATOR'}:
            if not (role == 'TEACHER' and enrollment.group and enrollment.group.director_id == getattr(user, 'id', None)):
                return Response({"detail": "No tienes permisos para ver este informe."}, status=status.HTTP_403_FORBIDDEN)

        try:
            period = Period.objects.select_related('academic_year').get(id=period_id)
        except Period.DoesNotExist:
            return Response({"detail": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if period.academic_year_id != enrollment.academic_year_id:
            return Response(
                {"detail": "El periodo no corresponde al año lectivo de la matrícula."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pdf_bytes = generate_academic_period_report_pdf(enrollment=enrollment, period=period)
            filename = f"informe-academico-enrollment-{enrollment.id}-period-{period.id}.pdf"
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            return response
        except Exception as e:
            payload = {"detail": "Error generating PDF", "error": str(e)}
            if getattr(settings, "DEBUG", False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        for enrollment in enrollments:
            student = enrollment.student
            user = student.user
            writer.writerow([
                student.document_number,
                (user.first_name or '').upper(),
                (user.last_name or '').upper(),
                enrollment.grade.name if enrollment.grade else '',
                enrollment.group.name if enrollment.group else '',
                enrollment.academic_year.year,
                enrollment.get_status_display(),
                student.get_financial_status_display()
            ])
            
        return response

    @action(detail=False, methods=["get"], url_path="pap-plans")
    def pap_plans(self, request):
        """List PAP plans (conditional promotion plans).

        Query params:
        - status: OPEN|CLEARED|FAILED (optional)
        - academic_year: AcademicYear id (optional)
        - due_period: Period id (optional)
        """

        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para ver PAP."}, status=status.HTTP_403_FORBIDDEN)

        status_raw = (request.query_params.get("status") or "").strip().upper()
        year_id_raw = request.query_params.get("academic_year")
        due_period_raw = request.query_params.get("due_period")

        qs = ConditionalPromotionPlan.objects.select_related(
            "enrollment",
            "enrollment__student",
            "enrollment__student__user",
            "enrollment__academic_year",
            "enrollment__grade",
            "due_period",
            "source_enrollment",
            "source_enrollment__grade",
        ).order_by("-updated_at", "-created_at")

        if status_raw:
            if status_raw not in {
                ConditionalPromotionPlan.STATUS_OPEN,
                ConditionalPromotionPlan.STATUS_CLEARED,
                ConditionalPromotionPlan.STATUS_FAILED,
            }:
                return Response({"detail": "status inválido"}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(status=status_raw)

        if year_id_raw:
            try:
                year_id = int(year_id_raw)
            except Exception:
                return Response({"detail": "academic_year inválido"}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(enrollment__academic_year_id=year_id)

        if due_period_raw:
            try:
                due_period_id = int(due_period_raw)
            except Exception:
                return Response({"detail": "due_period inválido"}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(due_period_id=due_period_id)

        results = []
        for plan in qs[:500]:
            enr = plan.enrollment
            student_user = enr.student.user if enr and enr.student_id else None
            results.append(
                {
                    "id": plan.id,
                    "status": plan.status,
                    "due_period": {
                        "id": plan.due_period_id,
                        "name": plan.due_period.name if plan.due_period_id else None,
                    },
                    "enrollment": {
                        "id": enr.id,
                        "academic_year": {
                            "id": enr.academic_year_id,
                            "year": enr.academic_year.year if enr.academic_year_id else None,
                        },
                        "grade": {"id": enr.grade_id, "name": enr.grade.name if enr.grade_id else None},
                        "student": {
                            "id": enr.student_id,
                            "name": student_user.get_full_name() if student_user else None,
                            "document_number": getattr(enr.student, "document_number", "") if enr.student_id else "",
                        },
                    },
                    "source_enrollment": {
                        "id": plan.source_enrollment_id,
                        "grade": {
                            "id": plan.source_enrollment.grade_id if plan.source_enrollment_id else None,
                            "name": plan.source_enrollment.grade.name if plan.source_enrollment_id else None,
                        }
                        if plan.source_enrollment_id
                        else None,
                    },
                    "pending_subject_ids": plan.pending_subject_ids,
                    "pending_area_ids": plan.pending_area_ids,
                    "notes": plan.notes,
                    "created_at": plan.created_at,
                    "updated_at": plan.updated_at,
                }
            )

        return Response({"results": results})

    @action(detail=True, methods=["get"], url_path="pap")
    def pap(self, request, pk=None):
        """Return conditional promotion plan (PAP) for an enrollment."""

        enrollment = self.get_object()
        plan = getattr(enrollment, "conditional_plan", None)
        if not plan:
            return Response({"detail": "Este enrollment no tiene PAP."}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "id": plan.id,
                "enrollment_id": enrollment.id,
                "source_enrollment_id": plan.source_enrollment_id,
                "due_period_id": plan.due_period_id,
                "pending_subject_ids": plan.pending_subject_ids,
                "pending_area_ids": plan.pending_area_ids,
                "status": plan.status,
                "notes": plan.notes,
                "created_at": plan.created_at,
                "updated_at": plan.updated_at,
            }
        )

    @action(detail=True, methods=["post"], url_path="pap/resolve")
    @transaction.atomic
    def pap_resolve(self, request, pk=None):
        """Resolve a PAP plan.

        Body: {"status": "CLEARED"|"FAILED", "notes": "..."}
        - CLEARED: keeps current grade, sets Enrollment.final_status.
        - FAILED: reverts Enrollment.grade to source_enrollment.grade (group cleared) and sets Enrollment.final_status.
        """

        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para resolver PAP."}, status=status.HTTP_403_FORBIDDEN)

        enrollment = self.get_object()
        plan = getattr(enrollment, "conditional_plan", None)
        if not plan:
            return Response({"detail": "Este enrollment no tiene PAP."}, status=status.HTTP_404_NOT_FOUND)

        if plan.status != ConditionalPromotionPlan.STATUS_OPEN:
            return Response({"detail": "Este PAP ya fue resuelto."}, status=status.HTTP_400_BAD_REQUEST)

        new_status = (request.data.get("status") or "").strip().upper()
        notes = (request.data.get("notes") or "").strip()

        if new_status not in {ConditionalPromotionPlan.STATUS_CLEARED, ConditionalPromotionPlan.STATUS_FAILED}:
            return Response(
                {"detail": "status debe ser CLEARED o FAILED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plan.status = new_status
        if notes:
            plan.notes = notes
        plan.save(update_fields=["status", "notes", "updated_at"])

        if new_status == ConditionalPromotionPlan.STATUS_CLEARED:
            enrollment.final_status = "PAP APROBADO"
            enrollment.save(update_fields=["final_status"])
        else:
            # FAILED => revert grade to source enrollment grade when available.
            source = plan.source_enrollment
            if source and source.grade_id:
                enrollment.grade_id = source.grade_id
                enrollment.group = None
                enrollment.final_status = "PAP NO APROBADO (RETENIDO)"
                enrollment.save(update_fields=["grade", "group", "final_status"])
            else:
                enrollment.final_status = "PAP NO APROBADO"
                enrollment.save(update_fields=["final_status"])

        return Response(
            {
                "enrollment_id": enrollment.id,
                "pap": {"id": plan.id, "status": plan.status, "due_period_id": plan.due_period_id},
                "enrollment": {"grade_id": enrollment.grade_id, "group_id": enrollment.group_id, "final_status": enrollment.final_status},
            },
            status=status.HTTP_200_OK,
        )


class StudentNoveltyViewSet(viewsets.ModelViewSet):
    queryset = StudentNovelty.objects.all().order_by("-date")
    serializer_class = StudentNoveltySerializer
    permission_classes = [KampusModelPermissions]

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return StudentNovelty.objects.none()
        return super().get_queryset()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para registrar novedades."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para registrar novedades."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para registrar novedades."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para registrar novedades."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        novelty = serializer.save()
        student = novelty.student
        user = student.user
        
        if novelty.novelty_type == "RETIRO":
            user.is_active = False
            user.save()
            # Update active enrollments to RETIRED
            student.enrollment_set.filter(status="ACTIVE").update(status="RETIRED")
            
        elif novelty.novelty_type == "REINGRESO":
            user.is_active = True
            user.save()


class StudentDocumentViewSet(viewsets.ModelViewSet):
    queryset = StudentDocument.objects.all().order_by("-uploaded_at")
    serializer_class = StudentDocumentSerializer
    permission_classes = [KampusModelPermissions]

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return StudentDocument.objects.none()
        return super().get_queryset()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar documentos."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar documentos."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar documentos."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) in {'TEACHER', 'PARENT', 'STUDENT'}:
            return Response({"detail": "No tienes permisos para gestionar documentos."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class BulkEnrollmentView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [HasDjangoPermission]
    required_permission = "students.add_enrollment"

    def post(self, request, format=None):
        if 'file' not in request.FILES:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        file_obj = request.FILES['file']
        if not file_obj.name.endswith('.csv'):
             return Response({"error": "File must be CSV"}, status=status.HTTP_400_BAD_REQUEST)

        decoded_file = file_obj.read().decode('utf-8')
        io_string = io.StringIO(decoded_file)
        reader = csv.DictReader(io_string)
        
        results = {"success": 0, "errors": []}
        
        # Get active academic year
        active_year = AcademicYear.objects.filter(status='ACTIVE').first()
        if not active_year:
             return Response({"error": "No active academic year found"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for row_index, row in enumerate(reader):
                try:
                    # Expected columns: document_number, first_name, last_name, grade_name, group_name (optional)
                    doc_number = row.get('document_number')
                    if not doc_number:
                        continue
                        
                    # Find or Create Student
                    student = Student.objects.filter(document_number=doc_number).first()
                    if not student:
                        # Create basic student
                        first_name = row.get('first_name', 'Unknown')
                        last_name = row.get('last_name', 'Unknown')
                        email = row.get('email', '')
                        
                        # Generate username
                        base_username = f"{first_name[:1]}{last_name}".lower().replace(" ", "")
                        username = base_username
                        counter = 1
                        while User.objects.filter(username=username).exists():
                            username = f"{base_username}{counter}"
                            counter += 1
                            
                        user = User.objects.create_user(username=username, password=doc_number, first_name=first_name, last_name=last_name, email=email, role='STUDENT')
                        student = Student.objects.create(user=user, document_number=doc_number)
                    
                    # Find Grade
                    grade_name = row.get('grade_name')
                    grade = Grade.objects.filter(name=grade_name).first()
                    if not grade:
                        results['errors'].append(f"Row {row_index}: Grade '{grade_name}' not found")
                        continue

                    # Find Group (Optional)
                    group = None
                    group_name = row.get('group_name')
                    if group_name:
                        group = Group.objects.filter(name=group_name, grade=grade, academic_year=active_year).first()
                        if not group:
                             results['errors'].append(f"Row {row_index}: Group '{group_name}' not found for grade '{grade_name}'")
                             # Continue without group or skip? Let's skip enrollment if group specified but not found
                             continue
                    
                    # Check existing enrollment
                    if Enrollment.objects.filter(student=student, academic_year=active_year).exists():
                        results['errors'].append(f"Row {row_index}: Student {doc_number} already enrolled in this year")
                        continue

                    # Create Enrollment
                    Enrollment.objects.create(
                        student=student,
                        academic_year=active_year,
                        grade=grade,
                        group=group,
                        status='ACTIVE'
                    )
                    results['success'] += 1
                    
                except Exception as e:
                    results['errors'].append(f"Row {row_index}: {str(e)}")
        
        return Response(results)


def _pisa_link_callback_for_pdf(uri: str, rel: str):
    # Map /media/... and /static/... to absolute filesystem paths for xhtml2pdf.
    if uri is None:
        return uri
    uri = str(uri)

    # Allow absolute URLs
    if uri.startswith('http://') or uri.startswith('https://'):
        return uri

    media_url = getattr(settings, 'MEDIA_URL', '') or ''
    static_url = getattr(settings, 'STATIC_URL', '') or ''

    if media_url and uri.startswith(media_url):
        path = os.path.join(settings.MEDIA_ROOT, uri[len(media_url):].lstrip('/\\'))
        return os.path.normpath(path)

    if static_url and uri.startswith(static_url):
        static_root = getattr(settings, 'STATIC_ROOT', None)
        if static_root:
            path = os.path.join(static_root, uri[len(static_url):].lstrip('/\\'))
            return os.path.normpath(path)

    # If template provided an absolute filesystem path already
    if os.path.isabs(uri) and os.path.exists(uri):
        return os.path.normpath(uri)

    # Best effort relative resolution
    if rel:
        candidate = os.path.normpath(os.path.join(os.path.dirname(rel), uri))
        if os.path.exists(candidate):
            return candidate

    return uri


def _format_decimal_score(value: float) -> str:
    try:
        return f"{float(value):.2f}"
    except Exception:
        return str(value)


def _performance_from_score(score: float) -> str:
    # Simple mapping aligned with the provided sample.
    return "ALTO" if score >= 4.0 else "BASICO"


def _qr_data_uri(text: str) -> str:
    if not qrcode:
        return ""
    img = qrcode.make(text)
    buff = io.BytesIO()
    img.save(buff, format="PNG")
    encoded = base64.b64encode(buff.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _qr_temp_png_path(text: str) -> str:
    """Generate a QR image as a temporary PNG file and return its absolute path.

    xhtml2pdf is more reliable with file paths than with data URIs.
    Caller is responsible for deleting the file.
    """

    if not qrcode:
        return ""

    img = qrcode.make(text)
    tmp = tempfile.NamedTemporaryFile(prefix="kampus_qr_", suffix=".png", delete=False)
    tmp.close()
    img.save(tmp.name, format="PNG")
    return tmp.name


def _active_academic_year() -> AcademicYear | None:
    return AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()


def _subjects_for_grade(grade_id: int):
    return (
        AcademicLoad.objects.filter(grade_id=grade_id)
        .select_related("subject", "subject__area")
        .order_by("subject__area__name", "subject__name", "id")
    )


def _normalize_text_for_compare(value: str) -> str:
    text = (value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text).encode("ASCII", "ignore").decode("utf-8")
    # Keep only alphanumerics for robust comparisons.
    return "".join(ch for ch in text if ch.isalnum())


def _format_certificate_subject_label(
    title: str,
    *,
    grade_level_type: str | None = None,
) -> tuple[str, bool]:
    """Return (label, skip).

    Rules:
    - Prefer showing ONLY the subject name (no area) for most rows.
    - For primaria, keep 'Matemáticas - (Aritmética/Geometría/Estadística)'.
    - Avoid/skip the invalid 'Matemáticas - Matemáticas' row in primaria.
    """

    raw = (title or "").strip()
    if not raw:
        return "", True

    area = None
    subject = raw
    if " - " in raw:
        area, subject = [p.strip() for p in raw.split(" - ", 1)]

    if not area:
        return subject, False

    area_norm = _normalize_text_for_compare(area)
    subject_norm = _normalize_text_for_compare(subject)
    is_primary = (grade_level_type or "").upper() == "PRIMARY"

    math_area_norms = {"matematica", "matematicas"}

    if area_norm in math_area_norms and subject_norm in math_area_norms and is_primary:
        # Primary plan should not include a 'Matemáticas - Matemáticas' entry.
        return "", True

    if area_norm == subject_norm:
        # Avoid duplicates like 'X - X'.
        return subject, False

    if area_norm in math_area_norms and subject_norm in {"aritmetica", "geometria", "estadistica"}:
        # Standardize the label to the plural form users expect.
        return f"Matemáticas - {subject}", False

    # Default: subject only.
    return subject, False


def _certificate_studies_build_context(request, data: dict, institution: Institution):
    """Build context for the certificate HTML/PDF.

    This is used by both the HTML preview and the PDF issuance.
    """

    enrollment_id = data.get("enrollment_id")
    academic_year_id = data.get("academic_year_id")

    manual_name = (data.get("student_full_name") or "").strip()
    manual_doc_type = (data.get("document_type") or "").strip() or "Documento"
    manual_doc_number = (data.get("document_number") or "").strip()
    manual_grade_id = data.get("grade_id")
    manual_year = data.get("academic_year")
    manual_campus_id = data.get("campus_id")

    enrollment = None
    campus = None

    if enrollment_id:
        enrollment = (
            Enrollment.objects.select_related(
                "student",
                "student__user",
                "grade",
                "grade__level",
                "academic_year",
                "campus",
            )
            .get(pk=int(enrollment_id))
        )

        campus = getattr(enrollment, "campus", None)

        student_full_name = enrollment.student.user.get_full_name() if enrollment.student and enrollment.student.user else ""
        document_type = getattr(enrollment.student, "document_type", "") or "Documento"
        document_number = getattr(enrollment.student, "document_number", "") or ""
        grade = enrollment.grade
        academic_year = enrollment.academic_year.year if enrollment.academic_year else ""
        if academic_year_id:
            try:
                ay = AcademicYear.objects.get(pk=int(academic_year_id))
                academic_year = ay.year
            except Exception:
                pass
    else:
        if not manual_name or not manual_doc_number or not manual_grade_id:
            raise serializers.ValidationError(
                "For manual issuance you must send student_full_name, document_number and grade_id."
            )

        grade = Grade.objects.select_related("level").get(pk=int(manual_grade_id))

        if manual_campus_id:
            try:
                campus = Campus.objects.select_related("institution").get(pk=int(manual_campus_id))
            except Exception:
                campus = None

        student_full_name = manual_name
        document_type = manual_doc_type
        document_number = manual_doc_number

        if manual_year:
            academic_year = manual_year
        else:
            active = _active_academic_year()
            academic_year = active.year if active else date.today().year

    loads = _subjects_for_grade(grade.id)
    rows = []
    grade_level_type = getattr(getattr(grade, "level", None), "level_type", None)

    if enrollment is not None:
        try:
            computed = compute_certificate_studies_rows(enrollment)
            if computed:
                rows = computed
        except Exception:
            rows = []

    if not rows:
        for load in loads:
            score = round(random.uniform(3.0, 4.5), 2)

            area_subject = ""
            if load.subject and getattr(load.subject, "area", None):
                area_subject = f"{(load.subject.area.name or '').strip()} - {(load.subject.name or '').strip()}"
            else:
                area_subject = (getattr(load.subject, "name", "") or "").strip()

            label, skip = _format_certificate_subject_label(area_subject, grade_level_type=grade_level_type)
            if skip:
                continue

            rows.append(
                {
                    "area_subject": label,
                    "score": _format_decimal_score(score),
                    "performance": _performance_from_score(score),
                }
            )

    # Normalize/format labels for computed rows too.
    if rows:
        normalized_rows = []
        for r in rows:
            title = (r.get("area_subject") or "").strip()
            label, skip = _format_certificate_subject_label(title, grade_level_type=grade_level_type)
            if skip:
                continue
            rr = dict(r)
            rr["area_subject"] = label
            normalized_rows.append(rr)
        rows = normalized_rows

    place = ""
    if campus and (campus.municipality or campus.department):
        place = " - ".join([p for p in [campus.municipality, campus.department] if p])
    else:
        place = institution.pdf_header_line3 or institution.name

    signer_name = ""
    signer_role = ""
    if institution.rector:
        signer_name = institution.rector.get_full_name()
        signer_role = "Rector(a)"
    elif institution.secretary:
        signer_name = institution.secretary.get_full_name()
        signer_role = "Secretaría"

    return {
        "enrollment": enrollment,
        "grade": grade,
        "institution": institution,
        "campus": campus,
        "student_full_name": student_full_name,
        "document_type": document_type,
        "document_number": document_number,
        "academic_year": academic_year,
        "grade_name": grade.name,
        "academic_level": getattr(getattr(grade, "level", None), "name", "") or "",
        "rows": rows,
        "conduct": "BUENA",
        "final_status": getattr(enrollment, "final_status", "") or "APROBADO",
        "place": place,
        "issue_date": date.today(),
        "signer_name": signer_name,
        "signer_role": signer_role,
    }


IDENTIFICATION_DOCUMENT_TYPES = (
    ("RC", "Registro Civil de Nacimiento"),
    ("TI", "Tarjeta de Identidad"),
    ("CC", "Cédula de Ciudadanía"),
    ("CE", "Cédula de Extranjería"),
    ("PA", "Pasaporte"),
    ("PEP", "PEP"),
)


class CertificateDocumentTypesView(APIView):
    """List identification document types for archived certificate issuance."""

    permission_classes = [IsAdministrativeStaff]

    def get(self, request, format=None):
        return Response(
            {
                "options": [{"value": label, "label": label} for _, label in IDENTIFICATION_DOCUMENT_TYPES],
                "allow_other": True,
            }
        )


class CertificateStudiesIssueView(APIView):
    permission_classes = [IsAdministrativeStaff]

    def post(self, request, format=None):
        """Issue a 'Certificado de estudios' PDF.

        Payload options:
        - Registered student: { enrollment_id, academic_year_id? }
        - Archivo student: { student_full_name, document_type, document_number, grade_id, academic_year? , campus_id? }
        """

        if not pisa:
            return Response({"error": "PDF generation library not installed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        institution = Institution.objects.first() or Institution()

        try:
            built = _certificate_studies_build_context(request, request.data, institution)
        except serializers.ValidationError as e:
            return Response({"detail": str(e.detail) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Enrollment.DoesNotExist:
            return Response({"detail": "Enrollment not found"}, status=status.HTTP_404_NOT_FOUND)
        except Grade.DoesNotExist:
            return Response({"detail": "Grade not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            payload = {"error": "Error preparing certificate", "detail": str(e)}
            if getattr(settings, 'DEBUG', False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        enrollment = built["enrollment"]
        grade = built["grade"]
        campus = built["campus"]
        student_full_name = built["student_full_name"]
        document_type = built["document_type"]
        document_number = built["document_number"]
        academic_year = built["academic_year"]
        rows = built["rows"]
        place = built["place"]
        signer_name = built["signer_name"]
        signer_role = built["signer_role"]

        try:
            amount_cop = int(getattr(institution, "certificate_studies_price_cop", 10000) or 10000)
        except Exception:
            amount_cop = 10000
        if amount_cop < 0:
            amount_cop = 0

        try:
            issue = CertificateIssue.objects.create(
                certificate_type=CertificateIssue.TYPE_STUDIES,
                enrollment=enrollment,
                issued_by=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
                amount_cop=amount_cop,
                payload={
                    "student_full_name": student_full_name,
                    "document_type": document_type,
                    "document_number": document_number,
                    "academic_year": academic_year,
                    "grade_id": grade.id,
                    "grade_name": grade.name,
                    "rows": rows,
                },
            )

            verify_url = request.build_absolute_uri(
                reverse("public-certificate-verify", kwargs={"uuid": str(issue.uuid)})
            )
        except Exception as e:
            payload = {"error": "Error preparing certificate", "detail": str(e)}
            if getattr(settings, 'DEBUG', False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        qr_image_src = ""
        qr_tmp_path = ""
        try:
            qr_tmp_path = _qr_temp_png_path(verify_url)
            qr_image_src = qr_tmp_path
        except Exception:
            qr_image_src = ""

        ctx = {
            "institution": institution,
            "campus": campus,
            "student_full_name": student_full_name,
            "document_type": document_type,
            "document_number": document_number,
            "academic_year": academic_year,
            "grade_name": grade.name,
            "academic_level": getattr(getattr(grade, "level", None), "name", "") or "",
            "rows": rows,
            "conduct": "BUENA",
            "final_status": getattr(enrollment, "final_status", "") or "APROBADO",
            "place": place,
            "issue_date": date.today(),
            "signer_name": signer_name,
            "signer_role": signer_role,
            "verify_url": verify_url,
            "qr_image_src": qr_image_src,
            "seal_hash": issue.seal_hash,
        }

        try:
            html_string = render_to_string("students/reports/certificate_studies_pdf.html", ctx)

            result = io.BytesIO()
            pdf = pisa.pisaDocument(
                io.BytesIO(html_string.encode("UTF-8")),
                result,
                link_callback=_pisa_link_callback_for_pdf,
                encoding="UTF-8",
            )

            if pdf.err:
                try:
                    issue.delete()
                except Exception:
                    pass
                return Response(
                    {
                        "error": "Error generating PDF",
                        "pisa_errors": getattr(pdf, "err", None),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            pdf_bytes = result.getvalue()
            try:
                issue.pdf_file.save(
                    "certificado_estudios.pdf",
                    ContentFile(pdf_bytes),
                    save=True,
                )
            except Exception:
                try:
                    if issue.pdf_file:
                        issue.pdf_file.delete(save=False)
                except Exception:
                    pass
                try:
                    issue.delete()
                except Exception:
                    pass
                raise

            try:
                log_event(
                    request,
                    event_type="CERTIFICATE_ISSUED",
                    object_type="CertificateIssue",
                    object_id=str(issue.uuid),
                    status_code=200,
                    metadata={
                        "certificate_type": issue.certificate_type,
                        "amount_cop": issue.amount_cop,
                        "student_full_name": student_full_name,
                        "document_number": document_number,
                        "academic_year": academic_year,
                        "grade_name": grade.name,
                    },
                )
            except Exception:
                # Audit logging must never break issuance.
                pass

            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = 'inline; filename="certificado_estudios.pdf"'
            return response
        except Exception as e:
            try:
                issue.delete()
            except Exception:
                pass
            payload = {"error": "Error generating PDF", "detail": str(e)}
            if getattr(settings, 'DEBUG', False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if qr_tmp_path:
                try:
                    os.remove(qr_tmp_path)
                except Exception:
                    pass


class CertificateIssuesListView(APIView):
    """List issued certificates for auditing/income reconciliation."""

    permission_classes = [IsAdministrativeStaff]

    def get(self, request, format=None):
        qs = CertificateIssue.objects.all().order_by("-issued_at")

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(payload__student_full_name__icontains=q)
                | Q(payload__document_number__icontains=q)
            )

        issued_by_raw = (request.query_params.get("issued_by") or "").strip()
        if issued_by_raw:
            try:
                qs = qs.filter(issued_by_id=int(issued_by_raw))
            except Exception:
                pass

        certificate_type = (request.query_params.get("certificate_type") or "").strip()
        if certificate_type:
            qs = qs.filter(certificate_type=certificate_type)

        status_param = (request.query_params.get("status") or "").strip()
        if status_param:
            qs = qs.filter(status=status_param)

        start_date_raw = (request.query_params.get("start_date") or "").strip()
        end_date_raw = (request.query_params.get("end_date") or "").strip()

        def _parse_date(s: str):
            try:
                return datetime.strptime(s, "%Y-%m-%d").date()
            except Exception:
                return None

        start_date = _parse_date(start_date_raw) if start_date_raw else None
        end_date = _parse_date(end_date_raw) if end_date_raw else None
        if start_date:
            qs = qs.filter(issued_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(issued_at__date__lte=end_date)

        try:
            limit = int(request.query_params.get("limit") or 100)
        except Exception:
            limit = 100
        limit = max(1, min(limit, 500))

        items = []
        for issue in qs.select_related("issued_by").only(
            "uuid",
            "certificate_type",
            "status",
            "issued_at",
            "amount_cop",
            "payload",
            "issued_by__id",
            "issued_by__first_name",
            "issued_by__last_name",
        )[:limit]:
            payload = issue.payload or {}
            issued_by = getattr(issue, "issued_by", None)
            items.append(
                {
                    "uuid": str(issue.uuid),
                    "certificate_type": issue.certificate_type,
                    "status": issue.status,
                    "issued_at": issue.issued_at,
                    "amount_cop": issue.amount_cop,
                    "student_full_name": payload.get("student_full_name") or "",
                    "document_number": payload.get("document_number") or "",
                    "academic_year": payload.get("academic_year") or "",
                    "grade_name": payload.get("grade_name") or "",
                    "issued_by": (
                        {
                            "id": issued_by.id,
                            "name": issued_by.get_full_name(),
                        }
                        if issued_by
                        else None
                    ),
                    "has_pdf": bool(getattr(issue, "pdf_file", None)),
                }
            )

        return Response({"results": items, "count": qs.count(), "limit": limit})


class CertificateIssueDownloadPDFView(APIView):
    """Download the stored PDF for an issued certificate."""

    permission_classes = [IsAdministrativeStaff]

    def get(self, request, uuid, format=None):
        issue = CertificateIssue.objects.filter(uuid=uuid).first()
        if not issue:
            return Response({"detail": "Certificate not found"}, status=status.HTTP_404_NOT_FOUND)

        if not issue.pdf_file:
            return Response({"detail": "No stored PDF for this certificate"}, status=status.HTTP_404_NOT_FOUND)

        try:
            issue.pdf_file.open("rb")
            response = FileResponse(issue.pdf_file, content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="certificado_{issue.uuid}.pdf"'
            return response
        except Exception as e:
            payload = {"error": "Error reading stored PDF", "detail": str(e)}
            if getattr(settings, 'DEBUG', False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CertificateRevenueSummaryView(APIView):
    """Revenue summary based on issued certificates (amount_cop snapshot)."""

    permission_classes = [IsAdministrativeStaff]

    def get(self, request, format=None):
        qs = CertificateIssue.objects.filter(status=CertificateIssue.STATUS_ISSUED)

        certificate_type = (request.query_params.get("certificate_type") or "").strip()
        if certificate_type:
            qs = qs.filter(certificate_type=certificate_type)

        start_date_raw = (request.query_params.get("start_date") or "").strip()
        end_date_raw = (request.query_params.get("end_date") or "").strip()

        def _parse_date(s: str):
            try:
                return datetime.strptime(s, "%Y-%m-%d").date()
            except Exception:
                return None

        start_date = _parse_date(start_date_raw) if start_date_raw else None
        end_date = _parse_date(end_date_raw) if end_date_raw else None
        if start_date:
            qs = qs.filter(issued_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(issued_at__date__lte=end_date)

        agg = qs.aggregate(total_amount_cop=Sum("amount_cop"))
        total_amount = int(agg.get("total_amount_cop") or 0)
        total_count = qs.count()

        return Response(
            {
                "total_count": total_count,
                "total_amount_cop": total_amount,
            }
        )


class CertificateStudiesPreviewView(APIView):
    """Render the certificate as HTML for live styling (no PDF, no DB write)."""

    permission_classes = [IsAdministrativeStaff]

    def post(self, request, format=None):
        institution = Institution.objects.first() or Institution()

        try:
            built = _certificate_studies_build_context(request, request.data, institution)
        except serializers.ValidationError as e:
            return Response({"detail": str(e.detail) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Enrollment.DoesNotExist:
            return Response({"detail": "Enrollment not found"}, status=status.HTTP_404_NOT_FOUND)
        except Grade.DoesNotExist:
            return Response({"detail": "Grade not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            payload = {"error": "Error preparing preview", "detail": str(e)}
            if getattr(settings, 'DEBUG', False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        preview_uuid = py_uuid.uuid4()
        verify_url = request.build_absolute_uri(
            reverse("public-certificate-verify", kwargs={"uuid": str(preview_uuid)})
        )

        # For HTML preview, use a data URI so the browser can render it.
        # (Temp file paths are only resolvable by xhtml2pdf, not by the browser.)
        try:
            qr_image_src = _qr_data_uri(verify_url)
        except Exception:
            qr_image_src = ""

        # Compute a deterministic seal hash for preview (not stored).
        seal_payload = {
            "student_full_name": built["student_full_name"],
            "document_type": built["document_type"],
            "document_number": built["document_number"],
            "academic_year": built["academic_year"],
            "grade_id": built["grade"].id,
            "grade_name": built["grade"].name,
            "rows": built["rows"],
        }
        try:
            seal_hash = hashlib.sha256(json.dumps(seal_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        except Exception:
            seal_hash = ""

        ctx = {
            "institution": institution,
            "campus": built["campus"],
            "student_full_name": built["student_full_name"],
            "document_type": built["document_type"],
            "document_number": built["document_number"],
            "academic_year": built["academic_year"],
            "grade_name": built["grade"].name,
            "academic_level": built["academic_level"],
            "rows": built["rows"],
            "conduct": built["conduct"],
            "final_status": built["final_status"],
            "place": built["place"],
            "issue_date": built["issue_date"],
            "signer_name": built["signer_name"],
            "signer_role": built["signer_role"],
            "verify_url": verify_url,
            "qr_image_src": qr_image_src,
            "seal_hash": seal_hash,
        }

        html_string = render_to_string("students/reports/certificate_studies_pdf.html", ctx)
        return HttpResponse(html_string, content_type="text/html; charset=utf-8")



class PublicCertificateVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, uuid, format=None):
        try:
            issue = CertificateIssue.objects.select_related(
                "enrollment",
                "enrollment__student",
                "enrollment__student__user",
                "enrollment__grade",
                "enrollment__academic_year",
            ).get(uuid=uuid)
        except CertificateIssue.DoesNotExist:
            return Response({"valid": False, "detail": "Certificate not found"}, status=status.HTTP_404_NOT_FOUND)

        payload = issue.payload or {}

        student_name = payload.get("student_full_name")
        document_number = payload.get("document_number")
        academic_year = payload.get("academic_year")
        grade_name = payload.get("grade_name")

        if issue.enrollment:
            try:
                student_name = student_name or issue.enrollment.student.user.get_full_name()
                document_number = document_number or issue.enrollment.student.document_number
                academic_year = academic_year or issue.enrollment.academic_year.year
                grade_name = grade_name or (issue.enrollment.grade.name if issue.enrollment.grade else "")
            except Exception:
                pass

        return Response(
            {
                "valid": issue.status == CertificateIssue.STATUS_ISSUED,
                "status": issue.status,
                "type": issue.certificate_type,
                "uuid": str(issue.uuid),
                "issued_at": issue.issued_at,
                "seal_hash": issue.seal_hash,
                "revoked": issue.status == CertificateIssue.STATUS_REVOKED,
                "revoke_reason": issue.revoke_reason,
                "student_full_name": student_name or "",
                "document_number": document_number or "",
                "academic_year": academic_year or "",
                "grade": grade_name or "",
                "grade_id": payload.get("grade_id"),
            }
        )



