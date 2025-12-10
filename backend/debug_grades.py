import os
import django
import sys

# Setup Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'kampus_backend.settings')
django.setup()

from academic.models import Grade, Group

print("--- Grades ---")
grades = Grade.objects.all()
for g in grades:
    print(f"ID: {g.id} | Name: {g.name}")

print("\n--- Groups ---")
groups = Group.objects.all()
for g in groups:
    print(f"ID: {g.id} | Name: {g.name} | Grade: {g.grade.name} (Grade ID: {g.grade.id})")
