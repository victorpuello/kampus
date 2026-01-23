from rest_framework import serializers
from .models import Institution, Campus

class InstitutionSerializer(serializers.ModelSerializer):
    rector_name = serializers.CharField(source='rector.get_full_name', read_only=True)
    secretary_name = serializers.CharField(source='secretary.get_full_name', read_only=True)

    class Meta:
        model = Institution
        fields = '__all__'

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)

        # Handle empty string for secretary field (set to None)
        if data.get('secretary') == '':
            data['secretary'] = None

        # Allow clearing file/image fields via PATCH with empty string.
        for field in ['logo', 'pdf_letterhead_image', 'pdf_rector_signature_image']:
            if data.get(field) in ('', 'null'):
                data[field] = None
        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        # If an image is replaced or cleared, delete the previous file to avoid orphan media.
        for field in ['logo', 'pdf_letterhead_image', 'pdf_rector_signature_image']:
            if field not in validated_data:
                continue

            incoming = validated_data.get(field)
            current = getattr(instance, field, None)
            if current and (incoming is None or incoming != current):
                try:
                    current.delete(save=False)
                except Exception:
                    pass

        return super().update(instance, validated_data)


class CampusSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source='institution.name', read_only=True)
    director_name = serializers.CharField(source='director.get_full_name', read_only=True)
    secretary_name = serializers.CharField(source='campus_secretary.get_full_name', read_only=True)
    coordinator_name = serializers.CharField(source='coordinator.get_full_name', read_only=True)
    
    class Meta:
        model = Campus
        fields = '__all__'

    def to_internal_value(self, data):
        # Handle empty strings for optional FK fields (set to None)
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ['director', 'campus_secretary', 'coordinator']:
            if field in data and data[field] == '':
                data[field] = None
        return super().to_internal_value(data)
