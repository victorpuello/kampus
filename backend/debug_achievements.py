import os
import django
import sys

# Setup Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'kampus_backend.settings')
django.setup()

from academic.models import Achievement, Group, Subject, Period

print("--- Debugging Achievements ---")
achievements = Achievement.objects.all()
print(f"Total Achievements: {achievements.count()}")

for ach in achievements:
    group_name = ach.group.name if ach.group else "None"
    grade_name = ach.group.grade.name if ach.group and ach.group.grade else "None"
    subject_name = ach.subject.name if ach.subject else "None"
    period_name = ach.period.name if ach.period else "None"
    print(f"ID: {ach.id} | Desc: {ach.description[:20]}... | Group: {group_name} (Grade: {grade_name}) | Subject: {subject_name} | Period: {period_name}")

print("\n--- Checking Groups ---")
groups = Group.objects.all()
for g in groups:
    print(f"ID: {g.id} | Name: {g.name} | Grade: {g.grade.name}")
