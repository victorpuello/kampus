import json
import os
import unicodedata

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument, ObserverAnnotation
from users.security import generate_temporary_password

User = get_user_model()


def _identity_document_max_file_size_bytes() -> int:
    raw_value = str(os.getenv("KAMPUS_IDENTITY_DOCUMENT_MAX_MB", "10") or "10").strip()
    try:
        size_mb = int(raw_value)
    except Exception:
        size_mb = 10
    if size_mb < 1:
        size_mb = 1
    return size_mb * 1024 * 1024


def _validate_identity_document_file(upload, *, field_name: str = "file") -> None:
    if not upload:
        return

    filename = str(getattr(upload, "name", "") or "")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = {"pdf", "png", "jpg", "jpeg", "webp"}
    if ext not in allowed_extensions:
        raise serializers.ValidationError({
            field_name: "Formato no permitido. Usa PDF, JPG, PNG o WebP.",
        })

    max_size_bytes = _identity_document_max_file_size_bytes()
    upload_size = getattr(upload, "size", None)
    if upload_size is not None and int(upload_size) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise serializers.ValidationError({
            field_name: f"El archivo supera el tamaño máximo permitido ({max_mb} MB).",
        })

class StudentDocumentSerializer(serializers.ModelSerializer):
    file_download_url = serializers.SerializerMethodField()

    class Meta:
        model = StudentDocument
        fields = ["id", "student", "document_type", "file", "file_download_url", "description", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at"]

    def get_file_download_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        try:
            if request is not None:
                return request.build_absolute_uri(f"/api/documents/{obj.id}/download/")
        except Exception:
            pass
        return f"/api/documents/{obj.id}/download/"

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        upload = attrs.get("file") if "file" in attrs else None
        if upload:
            _validate_identity_document_file(upload, field_name="file")

        has_public_file = bool(attrs.get("file") if "file" in attrs else getattr(instance, "file", None))
        has_private_file = bool(
            (attrs.get("file_private_relpath") if "file_private_relpath" in attrs else getattr(instance, "file_private_relpath", ""))
        )

        if not has_public_file and not has_private_file:
            raise serializers.ValidationError({"file": "Debes adjuntar un archivo o generar un PDF privado."})

        return attrs


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
    identity_document_download_url = serializers.SerializerMethodField()

    def _has_reusable_identity_document(self, document_number: str, exclude_pk: int | None = None) -> bool:
        normalized_document = (document_number or "").strip()
        if not normalized_document:
            return False

        candidates = FamilyMember.objects.filter(document_number__iexact=normalized_document)
        if exclude_pk is not None:
            candidates = candidates.exclude(pk=exclude_pk)

        return candidates.filter(
            Q(identity_document_private_relpath__gt="")
            | (Q(identity_document__isnull=False) & ~Q(identity_document=""))
        ).exists()

    class Meta:
        model = FamilyMember
        fields = [
            "id",
            "student",
            "user",
            "full_name",
            "document_number",
            "identity_document",
            "identity_document_download_url",
            "relationship",
            "phone",
            "email",
            "address",
            "is_main_guardian",
            "is_head_of_household",
        ]
        read_only_fields = ["id"]

    def get_identity_document_download_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        has_any_document = bool(getattr(obj, "identity_document", None)) or bool(
            (getattr(obj, "identity_document_private_relpath", "") or "").strip()
        )
        if not has_any_document:
            return ""

        try:
            if request is not None:
                return request.build_absolute_uri(f"/api/family-members/{obj.id}/identity-document/download/")
        except Exception:
            pass
        return f"/api/family-members/{obj.id}/identity-document/download/"

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)

        relationship = (attrs.get('relationship') if 'relationship' in attrs else getattr(instance, 'relationship', '')) or ''
        full_name = (attrs.get('full_name') if 'full_name' in attrs else getattr(instance, 'full_name', '')) or ''
        is_main_guardian = (
            attrs.get('is_main_guardian') if 'is_main_guardian' in attrs else getattr(instance, 'is_main_guardian', False)
        )
        student = attrs.get('student') if 'student' in attrs else getattr(instance, 'student', None)
        document_number = (
            attrs.get('document_number') if 'document_number' in attrs else getattr(instance, 'document_number', '')
        ) or ''
        identity_document = (
            attrs.get('identity_document') if 'identity_document' in attrs else getattr(instance, 'identity_document', None)
        )
        if attrs.get("identity_document"):
            _validate_identity_document_file(attrs.get("identity_document"), field_name="identity_document")

        identity_document_private_relpath = (
            attrs.get('identity_document_private_relpath')
            if 'identity_document_private_relpath' in attrs
            else getattr(instance, 'identity_document_private_relpath', '')
        )

        requires_identity = is_main_guardian or relationship in {"Padre", "Acudiente"}

        if requires_identity:
            if not document_number.strip():
                raise serializers.ValidationError({
                    "document_number": "El documento de identidad es requerido para Padre/Acudiente (o acudiente principal)."
                })
            has_existing_identity = bool(identity_document) or bool(str(identity_document_private_relpath or '').strip())
            if not has_existing_identity:
                instance_pk = getattr(instance, 'pk', None)
                has_reusable_identity = self._has_reusable_identity_document(
                    document_number=document_number,
                    exclude_pk=instance_pk,
                )
            else:
                has_reusable_identity = False

            if not has_existing_identity and not has_reusable_identity:
                raise serializers.ValidationError({
                    "identity_document": "Adjunta el documento de identidad (PDF o imagen) para Padre/Acudiente (o acudiente principal)."
                })

        if student is not None and document_number.strip():
            duplicate_document_qs = FamilyMember.objects.filter(
                student=student,
                document_number__iexact=document_number.strip(),
            )
            if instance is not None:
                duplicate_document_qs = duplicate_document_qs.exclude(pk=instance.pk)
            if duplicate_document_qs.exists():
                raise serializers.ValidationError(
                    {"document_number": "Ya existe un familiar con este documento para este estudiante."}
                )

        if student is not None and full_name.strip() and relationship.strip():
            duplicate_name_relationship_qs = FamilyMember.objects.filter(
                student=student,
                full_name__iexact=full_name.strip(),
                relationship__iexact=relationship.strip(),
            )
            if instance is not None:
                duplicate_name_relationship_qs = duplicate_name_relationship_qs.exclude(pk=instance.pk)
            if duplicate_name_relationship_qs.exists():
                raise serializers.ValidationError(
                    {"full_name": "Ya existe un familiar con el mismo nombre y parentesco para este estudiante."}
                )

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
    temporary_password = serializers.CharField(read_only=True)

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
            "temporary_password",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        temp_password = getattr(instance, "_temporary_password", None)
        if temp_password:
            data["temporary_password"] = temp_password
        else:
            data.pop("temporary_password", None)
        return data

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
            temporary_password = generate_temporary_password()
            # Create User
            user = User.objects.create_user(
                username=username,
                first_name=first_name,
                last_name=last_name,
                email=email,
                role=User.ROLE_STUDENT,
                password=temporary_password,
                must_change_password=True,
            )
            
            # Create Student
            student = Student.objects.create(user=user, **validated_data)
            student._temporary_password = temporary_password
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
