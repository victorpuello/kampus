from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicYearViewSet,
    AchievementViewSet,
    AreaViewSet,
    AssessmentViewSet,
    EvaluationComponentViewSet,
    EvaluationScaleViewSet,
    GradeViewSet,
    GroupViewSet,
    PeriodViewSet,
    StudentGradeViewSet,
    SubjectViewSet,
    TeacherAssignmentViewSet,
)

router = DefaultRouter()
router.register(r"academic-years", AcademicYearViewSet, basename="academicyear")
router.register(r"periods", PeriodViewSet, basename="period")
router.register(r"grades", GradeViewSet, basename="grade")
router.register(r"groups", GroupViewSet, basename="group")
router.register(r"areas", AreaViewSet, basename="area")
router.register(r"subjects", SubjectViewSet, basename="subject")
router.register(
    r"teacher-assignments", TeacherAssignmentViewSet, basename="teacherassignment"
)
router.register(r"evaluation-scales", EvaluationScaleViewSet, basename="evaluationscale")
router.register(
    r"evaluation-components", EvaluationComponentViewSet, basename="evaluationcomponent"
)
router.register(r"assessments", AssessmentViewSet, basename="assessment")
router.register(r"student-grades", StudentGradeViewSet, basename="studentgrade")
router.register(r"achievements", AchievementViewSet, basename="achievement")

urlpatterns = [
    path("", include(router.urls)),
]

