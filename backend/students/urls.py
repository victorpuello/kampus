from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, FamilyMemberViewSet, EnrollmentViewSet, 
    StudentNoveltyViewSet, StudentDocumentViewSet,
    BulkEnrollmentView
)


router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")
router.register(r"family-members", FamilyMemberViewSet, basename="familymember")
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"novelties", StudentNoveltyViewSet, basename="novelty")
router.register(r"documents", StudentDocumentViewSet, basename="document")

urlpatterns = [
    path("", include(router.urls)),
    path("enrollments/bulk-upload/", BulkEnrollmentView.as_view(), name="bulk-enrollment"),
]

