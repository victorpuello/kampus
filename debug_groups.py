import os
import django
import sys

# Add the project root to the python path
sys.path.append('/Users/victorpuello/kampus-1/backend')

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'kampus_backend.settings')
django.setup()

from academic.models import Group
from academic.serializers import GroupSerializer

try:
    groups = Group.objects.all()
    print(f"Found {groups.count()} groups.")
    for group in groups:
        print(f"Serializing group: {group.id} - {group.name}")
        serializer = GroupSerializer(group)
        print(serializer.data)
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
