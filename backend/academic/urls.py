from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AcademicYearViewSet, GradeViewSet


router = DefaultRouter()
router.register(r"academic-years", AcademicYearViewSet, basename="academicyear")
router.register(r"grades", GradeViewSet, basename="grade")

urlpatterns = [
    path("", include(router.urls)),
]

