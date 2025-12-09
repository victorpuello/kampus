from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument
import unicodedata

User = get_user_model()

class StudentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDocument
        fields = ["id", "student", "document_type", "file", "description", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at"]


class StudentNoveltySerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentNovelty
        fields = ["id", "student", "novelty_type", "date", "observation", "created_at"]
        read_only_fields = ["id", "created_at"]


class FamilyMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyMember
        fields = [
            "id",
            "student",
            "user",
            "full_name",
            "document_number",
            "relationship",
            "phone",
            "email",
            "address",
            "is_main_guardian",
            "is_head_of_household",
        ]
        read_only_fields = ["id"]


class StudentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class StudentSerializer(serializers.ModelSerializer):
    id = serializers.ReadOnlyField(source='pk')
    # Write-only fields for User creation
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=False, write_only=True, allow_blank=True)
    
    # Read-only nested user info
    user = StudentUserSerializer(read_only=True)
    
    family_members = FamilyMemberSerializer(many=True, read_only=True)
    novelties = StudentNoveltySerializer(many=True, read_only=True)
    documents = StudentDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Student
        fields = [
            "id",
            "user",
            "first_name",
            "last_name",
            "email",
            # Identification
            "document_type",
            "document_number",
            "place_of_issue",
            "nationality",
            "birth_date",
            "sex",
            "blood_type",
            # Residence & Contact
            "address",
            "neighborhood",
            "phone",
            "living_with",
            "stratum",
            # Socioeconomic
            "ethnicity",
            "sisben_score",
            "eps",
            "is_victim_of_conflict",
            # Disability & Support
            "has_disability",
            "disability_description",
            "disability_type",
            "support_needs",
            # Health & Emergency
            "allergies",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
            # New fields
            "photo",
            "financial_status",
            # Relations
            "family_members",
            "novelties",
            "documents",
        ]

    def generate_username(self, first_name, last_name):
        def normalize(text):
            # Normalize to NFKD (decomposing characters) and filter non-spacing marks
            return unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8').lower().replace(" ", "")

        normalized_first = normalize(first_name)
        normalized_last = normalize(last_name)
        
        base_username = f"{normalized_first}.{normalized_last}"
        username = base_username
        counter = 1
        
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1
            
        return username

    def create(self, validated_data):
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        email = validated_data.pop('email', None)
        
        if not first_name:
            raise serializers.ValidationError({"first_name": "Este campo es requerido."})
        if not last_name:
            raise serializers.ValidationError({"last_name": "Este campo es requerido."})
            
        # Handle empty email
        if email == '':
            email = None
            
        # Check email uniqueness if provided
        if email and User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"email": "Ya existe un usuario con este correo electrónico."})
        
        username = self.generate_username(first_name, last_name)
        
        try:
            # Create User
            user = User.objects.create_user(
                username=username,
                first_name=first_name,
                last_name=last_name,
                email=email,
                role=User.ROLE_STUDENT,
                password=username # Default password is the username
            )
            
            # Create Student
            student = Student.objects.create(user=user, **validated_data)
            return student
        except Exception as e:
            # If user was created but student failed, we should probably rollback or delete user
            # But since we are in a transaction (atomic request usually), it should be fine.
            # However, explicit handling is better.
            if 'user' in locals() and user.pk:
                user.delete()
            raise serializers.ValidationError({"detail": f"Error creando estudiante: {str(e)}"})

    def update(self, instance, validated_data):
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        email = validated_data.pop('email', None)
        
        instance = super().update(instance, validated_data)
        
        user = instance.user
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        if email is not None:
            user.email = email
            
        if first_name or last_name or email is not None:
            user.save()
            
        return instance


class EnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "academic_year",
            "grade",
            "group",
            "campus",
            "status",
            "origin_school",
            "final_status",
        ]
        read_only_fields = ["id"]

    def to_representation(self, instance):
        response = super().to_representation(instance)
        response['student'] = {
            'id': instance.student.pk,
            'full_name': instance.student.user.get_full_name(),
            'document_number': instance.student.document_number
        }
        response['academic_year'] = {
            'id': instance.academic_year.pk,
            'year': instance.academic_year.year
        }
        response['grade'] = {
            'id': instance.grade.pk,
            'name': instance.grade.name
        }
        if instance.group:
            response['group'] = {
                'id': instance.group.pk,
                'name': instance.group.name
            }
        return response

    def validate(self, data):
        group = data.get('group')
        grade = data.get('grade')
        academic_year = data.get('academic_year')
        campus = data.get('campus')
        student = data.get('student')

        # 1. Validate Financial Status (Paz y Salvo)
        if student and student.financial_status == 'DEBT':
            # Check if user is admin to override? For now, strict block.
            # You can add logic here to allow admins to bypass.
            user = self.context['request'].user
            if not (user.is_superuser or user.role == 'ADMIN'):
                 raise serializers.ValidationError({"student": "El estudiante se encuentra en mora (No Paz y Salvo)."})

        if group:
            # Validate Group belongs to Grade
            if group.grade != grade:
                raise serializers.ValidationError({"group": "El grupo seleccionado no pertenece al grado indicado."})
            
            # Validate Group belongs to Academic Year
            if group.academic_year != academic_year:
                raise serializers.ValidationError({"group": "El grupo no corresponde al año lectivo seleccionado."})
            
            # Validate Group belongs to Campus (if campus is provided)
            if campus and group.campus != campus:
                raise serializers.ValidationError({"group": "El grupo no pertenece a la sede seleccionada."})
            
            # 2. Validate Group Capacity
            # Count active enrollments for this group
            current_enrollments = Enrollment.objects.filter(group=group, status='ACTIVE').count()
            if current_enrollments >= group.capacity:
                 # Check if we are updating an existing enrollment to this group (don't count itself)
                 if self.instance and self.instance.group == group:
                     pass
                 else:
                     raise serializers.ValidationError({"group": f"El grupo ha alcanzado su capacidad máxima ({group.capacity})."})

        return data
