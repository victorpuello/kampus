from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PdfHealthcheckAPIView, ReportJobViewSet

router = DefaultRouter()
router.register(r"reports/jobs", ReportJobViewSet, basename="report-jobs")

urlpatterns = [
	*router.urls,
	path("reports/health/pdf/", PdfHealthcheckAPIView.as_view(), name="reports-health-pdf"),
]
