from rest_framework import serializers
from django.db import transaction
from django.contrib.auth import get_user_model
from .models import Teacher
import unicodedata

User = get_user_model()

class TeacherUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class TeacherSerializer(serializers.ModelSerializer):
    # Write-only fields for User creation/update
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=False, write_only=True, allow_blank=True)
    
    # Read-only nested user info
    user = TeacherUserSerializer(read_only=True)
    id = serializers.ReadOnlyField(source='pk')

    class Meta:
        model = Teacher
        fields = [
            "id",
            "user",
            "first_name",
            "last_name",
            "email",
            "document_type",
            "document_number",
            "phone",
            "address",
            "title",
            "specialty",
            "regime",
            "salary_scale",
            "hiring_date",
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
        email = validated_data.pop('email', '')
        
        if not first_name:
            raise serializers.ValidationError({"first_name": "Este campo es requerido."})
        if not last_name:
            raise serializers.ValidationError({"last_name": "Este campo es requerido."})
        
        username = self.generate_username(first_name, last_name)
        
        with transaction.atomic():
            # Create User
            user = User.objects.create_user(
                username=username,
                first_name=first_name,
                last_name=last_name,
                email=email,
                role=User.ROLE_TEACHER,
                password=username # Default password is the username
            )
            
            # Create Teacher
            teacher = Teacher.objects.create(user=user, **validated_data)
            return teacher

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
