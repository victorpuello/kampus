from django.core.management import call_command
from django.test import TestCase

from academic.models import AcademicLevel, Grade


class SeedGradeOrdinalsCommandTests(TestCase):
    def setUp(self):
        level = AcademicLevel.objects.create(name="Nivel", level_type="SECONDARY")
        self.g1 = Grade.objects.create(name="Octavo", level=level, ordinal=None)
        self.g2 = Grade.objects.create(name="Undécimo", level=level, ordinal=None)
        self.unknown = Grade.objects.create(name="Ciclo 99", level=level, ordinal=None)

    def test_seed_grade_ordinals_sets_known(self):
        call_command("seed_grade_ordinals")
        self.g1.refresh_from_db()
        self.g2.refresh_from_db()
        self.unknown.refresh_from_db()

        self.assertEqual(self.g1.ordinal, 10)
        self.assertEqual(self.g2.ordinal, 13)
        self.assertIsNone(self.unknown.ordinal)

    def test_seed_grade_ordinals_dry_run_does_not_write(self):
        call_command("seed_grade_ordinals", dry_run=True)
        self.g1.refresh_from_db()
        self.assertIsNone(self.g1.ordinal)
