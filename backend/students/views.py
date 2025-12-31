from rest_framework import viewsets, filters, serializers
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from django.db import transaction
from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.conf import settings
import csv
import io
import os
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal
from academic.models import AcademicYear, Grade, Group
from core.models import Institution
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument, ConditionalPromotionPlan
try:
    from xhtml2pdf import pisa
except ImportError:
    pisa = None

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

User = get_user_model()



class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user").all().order_by("user__id")
    serializer_class = StudentSerializer
    permission_classes = [KampusModelPermissions]
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = StudentPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__first_name', 'user__last_name', 'document_number']

    def get_queryset(self):
        qs = Student.objects.select_related("user").all().order_by("user__id")
        user = getattr(self.request, 'user', None)

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

            return (
                qs.filter(
                    enrollment__group__in=directed_groups,
                    enrollment__status='ACTIVE',
                )
                .distinct()
            )

        return qs

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
    queryset = Enrollment.objects.select_related("student").all().order_by("id")
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
    def report(self, request):
        # Filters
        year_id = request.query_params.get('year')
        grade_id = request.query_params.get('grade')
        group_id = request.query_params.get('group')
        report_format = request.query_params.get('format', 'csv')
        
        enrollments = Enrollment.objects.select_related('student', 'student__user', 'grade', 'group', 'academic_year').all().order_by('student__user__last_name', 'student__user__first_name')
        
        # Filter logic
        year_name = "Todos"
        grade_name = ""
        group_name = ""

        if year_id:
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
        
        if grade_id:
            enrollments = enrollments.filter(grade_id=grade_id)
            try:
                grade_name = Grade.objects.get(pk=grade_id).name
            except: pass

        if group_id:
            enrollments = enrollments.filter(group_id=group_id)
            try:
                group_name = Group.objects.get(pk=group_id).name
            except: pass
            
        # PDF Generation
        if report_format == 'pdf':
            if not pisa:
                return Response({"error": "PDF generation library not installed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            institution = Institution.objects.first()
            
            html_string = render_to_string('students/reports/enrollment_list_pdf.html', {
                'enrollments': enrollments,
                'institution': institution,
                'year_name': year_name,
                'grade_name': grade_name,
                'group_name': group_name,
                'MEDIA_ROOT': settings.MEDIA_ROOT,
            })
            
            result = io.BytesIO()
            pdf = pisa.pisaDocument(io.BytesIO(html_string.encode("UTF-8")), result)
            
            if not pdf.err:
                response = HttpResponse(result.getvalue(), content_type='application/pdf')
                response['Content-Disposition'] = 'inline; filename="reporte_matriculados.pdf"'
                return response
            else:
                return Response({"error": "Error generating PDF"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # CSV Generation (Default)
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="matriculados.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Documento', 'Nombres', 'Apellidos', 'Grado', 'Grupo', 'Año', 'Estado', 'Paz y Salvo'])
        
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



