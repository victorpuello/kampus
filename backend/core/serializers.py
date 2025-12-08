from rest_framework import serializers
from .models import Institution, Campus

class InstitutionSerializer(serializers.ModelSerializer):
    rector_name = serializers.CharField(source='rector.get_full_name', read_only=True)
    secretary_name = serializers.CharField(source='secretary.get_full_name', read_only=True)

    class Meta:
        model = Institution
        fields = '__all__'

    def to_internal_value(self, data):
        # Handle empty string for secretary field (set to None)
        if 'secretary' in data and data['secretary'] == '':
            data = data.copy()
            data['secretary'] = None
        return super().to_internal_value(data)


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
