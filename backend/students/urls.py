from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentViewSet, FamilyMemberViewSet, EnrollmentViewSet


router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")
router.register(r"family-members", FamilyMemberViewSet, basename="familymember")
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")

urlpatterns = [
    path("", include(router.urls)),
]

