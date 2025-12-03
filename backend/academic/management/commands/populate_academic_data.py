from datetime import date

from academic.models import (
    AcademicYear,
    Area,
    Grade,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)
from django.core.management.base import BaseCommand
from users.models import User


class Command(BaseCommand):
    help = "Populates the database with initial academic data"

    def handle(self, *args, **kwargs):
        self.stdout.write("Populating academic data...")

        # Create Academic Year
        year, created = AcademicYear.objects.get_or_create(year=2025)
        if created:
            self.stdout.write(f"Created Academic Year: {year}")

        # Create Periods
        periods_data = [
            {
                "name": "Period 1",
                "start_date": date(2025, 2, 1),
                "end_date": date(2025, 4, 15),
            },
            {
                "name": "Period 2",
                "start_date": date(2025, 4, 16),
                "end_date": date(2025, 6, 30),
            },
            {
                "name": "Period 3",
                "start_date": date(2025, 7, 15),
                "end_date": date(2025, 9, 30),
            },
            {
                "name": "Period 4",
                "start_date": date(2025, 10, 1),
                "end_date": date(2025, 11, 30),
            },
        ]
        for p_data in periods_data:
            Period.objects.get_or_create(academic_year=year, **p_data)

        # Create Grades
        grades_names = ["Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh"]
        grades = {}
        for name in grades_names:
            grade, _ = Grade.objects.get_or_create(name=name)
            grades[name] = grade

        # Create Areas
        areas_data = [
            "Mathematics",
            "Natural Sciences",
            "Social Sciences",
            "Language",
            "English",
        ]
        areas = {}
        for name in areas_data:
            area, _ = Area.objects.get_or_create(name=name)
            areas[name] = area

        # Create Subjects for Sixth Grade
        subjects_data = [
            {"name": "Arithmetic", "area": "Mathematics", "weight": 60},
            {"name": "Geometry", "area": "Mathematics", "weight": 40},
            {"name": "Biology", "area": "Natural Sciences", "weight": 50},
            {"name": "Physics", "area": "Natural Sciences", "weight": 50},
            {"name": "History", "area": "Social Sciences", "weight": 50},
            {"name": "Geography", "area": "Social Sciences", "weight": 50},
            {"name": "Spanish", "area": "Language", "weight": 100},
            {"name": "English", "area": "English", "weight": 100},
        ]

        sixth_grade = grades["Sixth"]
        for s_data in subjects_data:
            Subject.objects.get_or_create(
                name=s_data["name"],
                area=areas[s_data["area"]],
                grade=sixth_grade,
                defaults={"weight_percentage": s_data["weight"]},
            )

        # Create Groups
        groups_data = ["A", "B"]
        for g_name in groups_data:
            Group.objects.get_or_create(
                name=g_name, grade=sixth_grade, academic_year=year
            )

        self.stdout.write(self.style.SUCCESS("Successfully populated academic data"))
