import json
import unicodedata

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument, ObserverAnnotation

User = get_user_model()

class StudentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDocument
        fields = ["id", "student", "document_type", "file", "description", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at"]


class ObserverAnnotationSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    deleted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ObserverAnnotation
        fields = [
            "id",
            "student",
            "period",
            "annotation_type",
            "title",
            "text",
            "commitments",
            "commitment_due_date",
            "commitment_responsible",
            "is_automatic",
            "rule_key",
            "meta",
            "is_deleted",
            "deleted_at",
            "created_by",
            "updated_by",
            "deleted_by",
            "created_at",
            "updated_at",
            "created_by_name",
            "updated_by_name",
            "deleted_by_name",
        ]
        read_only_fields = [
            "id",
            "is_automatic",
            "rule_key",
            "meta",
            "is_deleted",
            "deleted_at",
            "created_by",
            "updated_by",
            "deleted_by",
            "created_at",
            "updated_at",
            "created_by_name",
            "updated_by_name",
            "deleted_by_name",
        ]

    def _full_name(self, u) -> str:
        try:
            return u.get_full_name() or getattr(u, "username", "") or ""
        except Exception:
            return ""

    def get_created_by_name(self, obj) -> str:
        return self._full_name(getattr(obj, "created_by", None))

    def get_updated_by_name(self, obj) -> str:
        return self._full_name(getattr(obj, "updated_by", None))

    def get_deleted_by_name(self, obj) -> str:
        return self._full_name(getattr(obj, "deleted_by", None))

    def _format_commitments_value(self, value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            return raw

        try:
            parsed = json.loads(raw)
        except Exception:
            return raw

        if not isinstance(parsed, dict):
            return raw

        sections = [
            ("Compromisos del estudiante", parsed.get("student_commitments") or []),
            ("Compromisos del acudiente", parsed.get("guardian_commitments") or []),
            ("Compromisos de la institución", parsed.get("institution_commitments") or []),
        ]

        lines: list[str] = []
        for title, items in sections:
            if not isinstance(items, list):
                continue
            clean_items = [str(item).strip() for item in items if str(item).strip()]
            if not clean_items:
                continue
            lines.append(f"{title}:")
            lines.extend([f"- {item}" for item in clean_items])
            lines.append("")

        return "\n".join(lines).strip() or raw

    def to_representation(self, instance):
        response = super().to_representation(instance)
        response["commitments"] = self._format_commitments_value(str(response.get("commitments") or ""))
        return response


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
            "identity_document",
            "relationship",
            "phone",
            "email",
            "address",
            "is_main_guardian",
            "is_head_of_household",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)

        relationship = (attrs.get('relationship') if 'relationship' in attrs else getattr(instance, 'relationship', '')) or ''
        is_main_guardian = (
            attrs.get('is_main_guardian') if 'is_main_guardian' in attrs else getattr(instance, 'is_main_guardian', False)
        )
        document_number = (
            attrs.get('document_number') if 'document_number' in attrs else getattr(instance, 'document_number', '')
        ) or ''
        identity_document = (
            attrs.get('identity_document') if 'identity_document' in attrs else getattr(instance, 'identity_document', None)
        )

        requires_identity = is_main_guardian or relationship in {"Padre", "Acudiente"}

        if requires_identity:
            if not document_number.strip():
                raise serializers.ValidationError({
                    "document_number": "El documento de identidad es requerido para Padre/Acudiente (o acudiente principal)."
                })
            if not identity_document:
                raise serializers.ValidationError({
                    "identity_document": "Adjunta el documento de identidad (PDF o imagen) para Padre/Acudiente (o acudiente principal)."
                })

        return attrs


class StudentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class StudentSerializer(serializers.ModelSerializer):
    id = serializers.ReadOnlyField(source='pk')
    current_enrollment_status = serializers.CharField(read_only=True)
    current_grade_ordinal = serializers.IntegerField(read_only=True)
    current_grade_name = serializers.CharField(read_only=True)
    completion = serializers.SerializerMethodField()
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
            "current_enrollment_status",
            "current_grade_ordinal",
            "current_grade_name",
            "completion",
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
            "photo_thumb",
            "financial_status",
            # Relations
            "family_members",
            "novelties",
            "documents",
        ]

    def get_completion(self, obj):
        mapping = self.context.get("completion_by_student_id") if isinstance(self.context, dict) else None
        if not mapping:
            return None
        try:
            return mapping.get(int(getattr(obj, "pk", 0)))
        except Exception:
            return None

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
            "enrolled_at",
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
            'year': instance.academic_year.year,
            'status': getattr(instance.academic_year, 'status', None),
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
        instance = getattr(self, 'instance', None)

        group = data.get('group') if 'group' in data else getattr(instance, 'group', None)
        grade = data.get('grade') if 'grade' in data else getattr(instance, 'grade', None)
        academic_year = (
            data.get('academic_year') if 'academic_year' in data else getattr(instance, 'academic_year', None)
        )
        campus = data.get('campus') if 'campus' in data else getattr(instance, 'campus', None)
        student = data.get('student') if 'student' in data else getattr(instance, 'student', None)

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
