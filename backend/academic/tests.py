from django.test import TestCase
from academic.models import AchievementDefinition

class AchievementDefinitionModelTest(TestCase):
    def test_code_auto_generation(self):
        # Create a definition without code
        def1 = AchievementDefinition.objects.create(description="Test Achievement 1")
        self.assertTrue(def1.code.startswith("LOG-"))
        self.assertEqual(def1.code, f"LOG-{def1.id:04d}")

        # Create another one
        def2 = AchievementDefinition.objects.create(description="Test Achievement 2")
        self.assertTrue(def2.code.startswith("LOG-"))
        self.assertNotEqual(def1.code, def2.code)
        self.assertEqual(def2.code, f"LOG-{def2.id:04d}")

    def test_code_manual_assignment(self):
        # Create a definition with manual code (should be preserved if logic allows, 
        # but my logic overrides if not self.code. If self.code is present, it keeps it.)
        def3 = AchievementDefinition.objects.create(code="MANUAL-001", description="Manual Code")
        self.assertEqual(def3.code, "MANUAL-001")
