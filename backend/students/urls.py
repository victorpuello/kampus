from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentViewSet, FamilyMemberViewSet, EnrollmentViewSet, StudentNoveltyViewSet


router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")
router.register(r"family-members", FamilyMemberViewSet, basename="familymember")
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"novelties", StudentNoveltyViewSet, basename="novelty")

urlpatterns = [
    path("", include(router.urls)),
]

