from rest_framework import viewsets, filters
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from django.db import transaction
from django.contrib.auth import get_user_model
import csv
import io
from academic.models import AcademicYear, Grade, Group
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument
from .serializers import (
    StudentSerializer,
    FamilyMemberSerializer,
    EnrollmentSerializer,
    StudentNoveltySerializer,
    StudentDocumentSerializer,
)
from .permissions import IsSecretaryOrAdminOrReadOnly
import traceback

User = get_user_model()



class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user").all().order_by("user__id")
    serializer_class = StudentSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__first_name', 'user__last_name', 'document_number']

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            print("ERROR IN STUDENT LIST:")
            traceback.print_exc()
            return Response({"error": str(e), "traceback": traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
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


class FamilyMemberViewSet(viewsets.ModelViewSet):
    queryset = FamilyMember.objects.select_related("student").all().order_by("id")
    serializer_class = FamilyMemberSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]

    def create(self, request, *args, **kwargs):
        print("FAMILY MEMBER CREATE DATA:", request.data)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("FAMILY MEMBER ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.select_related("student").all().order_by("id")
    serializer_class = EnrollmentSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]


class StudentNoveltyViewSet(viewsets.ModelViewSet):
    queryset = StudentNovelty.objects.all().order_by("-date")
    serializer_class = StudentNoveltySerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]

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
    permission_classes = [IsSecretaryOrAdminOrReadOnly]


class BulkEnrollmentView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsSecretaryOrAdminOrReadOnly]

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


class EnrollmentReportView(APIView):
    permission_classes = [IsSecretaryOrAdminOrReadOnly]

    def get(self, request, format=None):
        # Filters
        year_id = request.query_params.get('year')
        grade_id = request.query_params.get('grade')
        group_id = request.query_params.get('group')
        
        enrollments = Enrollment.objects.select_related('student', 'student__user', 'grade', 'group', 'academic_year').all()
        
        if year_id:
            enrollments = enrollments.filter(academic_year_id=year_id)
        else:
            # Default to active year
            active_year = AcademicYear.objects.filter(status='ACTIVE').first()
            if active_year:
                enrollments = enrollments.filter(academic_year=active_year)
        
        if grade_id:
            enrollments = enrollments.filter(grade_id=grade_id)
        if group_id:
            enrollments = enrollments.filter(group_id=group_id)
            
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="matriculados.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Documento', 'Nombres', 'Apellidos', 'Grado', 'Grupo', 'Año', 'Estado', 'Paz y Salvo'])
        
        for enrollment in enrollments:
            student = enrollment.student
            user = student.user
            writer.writerow([
                student.document_number,
                user.first_name,
                user.last_name,
                enrollment.grade.name if enrollment.grade else '',
                enrollment.group.name if enrollment.group else '',
                enrollment.academic_year.year,
                enrollment.get_status_display(),
                student.get_financial_status_display()
            ])
            
        return response
