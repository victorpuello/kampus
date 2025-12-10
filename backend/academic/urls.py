from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicLevelViewSet,
    AcademicYearViewSet,
    AchievementDefinitionViewSet,
    AchievementViewSet,
    AreaViewSet,
    AssessmentViewSet,
    EvaluationComponentViewSet,
    EvaluationScaleViewSet,
    GradeViewSet,
    GroupViewSet,
    PerformanceIndicatorViewSet,
    PeriodViewSet,
    StudentGradeViewSet,
    SubjectViewSet,
    TeacherAssignmentViewSet,
    AcademicLoadViewSet,
)

router = DefaultRouter()
router.register(r"academic-years", AcademicYearViewSet, basename="academicyear")
router.register(r"academic-levels", AcademicLevelViewSet, basename="academiclevel")
router.register(r"periods", PeriodViewSet, basename="period")
router.register(r"grades", GradeViewSet, basename="grade")
router.register(r"groups", GroupViewSet, basename="group")
router.register(r"areas", AreaViewSet, basename="area")
router.register(r"subjects", SubjectViewSet, basename="subject")
router.register(r"academic-loads", AcademicLoadViewSet, basename="academicload")
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
router.register(r"achievement-definitions", AchievementDefinitionViewSet, basename="achievementdefinition")
router.register(r"performance-indicators", PerformanceIndicatorViewSet, basename="performanceindicator")

urlpatterns = [
    path("", include(router.urls)),
]

