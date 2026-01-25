from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, FamilyMemberViewSet, EnrollmentViewSet, 
    StudentNoveltyViewSet, StudentDocumentViewSet,
    ObserverAnnotationViewSet,
    CertificateDocumentTypesView,
    CertificateStudiesPreviewView,
    CertificateStudiesIssueView,
    CertificateIssuesListView,
    CertificateIssueDetailView,
    CertificateIssueDownloadPDFView,
    CertificateRevenueSummaryView,
    BulkEnrollmentView
)


router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")
router.register(r"family-members", FamilyMemberViewSet, basename="familymember")
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"novelties", StudentNoveltyViewSet, basename="novelty")
router.register(r"documents", StudentDocumentViewSet, basename="document")
router.register(r"observer-annotations", ObserverAnnotationViewSet, basename="observerannotation")

urlpatterns = [
    path("", include(router.urls)),
    path("enrollments/bulk-upload/", BulkEnrollmentView.as_view(), name="bulk-enrollment"),
    path("certificates/document-types/", CertificateDocumentTypesView.as_view(), name="certificate-document-types"),
    path("certificates/studies/preview/", CertificateStudiesPreviewView.as_view(), name="certificate-studies-preview"),
    path("certificates/studies/issue/", CertificateStudiesIssueView.as_view(), name="certificate-studies-issue"),
    path("certificates/issues/", CertificateIssuesListView.as_view(), name="certificate-issues-list"),
    path("certificates/issues/<uuid:uuid>/", CertificateIssueDetailView.as_view(), name="certificate-issue-detail"),
    path("certificates/issues/<uuid:uuid>/pdf/", CertificateIssueDownloadPDFView.as_view(), name="certificate-issue-pdf"),
    path("certificates/revenue/summary/", CertificateRevenueSummaryView.as_view(), name="certificate-revenue-summary"),
]

