from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
	OperationsJobsOverviewAPIView,
	OperationsPeriodicJobToggleAPIView,
	OperationsPeriodicJobParamsAPIView,
	OperationsPeriodicJobScheduleAPIView,
	OperationsPeriodicRunLogsAPIView,
	OperationsRunLogsAPIView,
	OperationsRunNowAPIView,
	PdfHealthcheckAPIView,
	ReportJobViewSet,
)

router = DefaultRouter()
router.register(r"reports/jobs", ReportJobViewSet, basename="report-jobs")

urlpatterns = [
	*router.urls,
	path("reports/health/pdf/", PdfHealthcheckAPIView.as_view(), name="reports-health-pdf"),
	path("reports/operations/jobs/overview/", OperationsJobsOverviewAPIView.as_view(), name="reports-ops-overview"),
	path("reports/operations/jobs/run-now/", OperationsRunNowAPIView.as_view(), name="reports-ops-run-now"),
	path("reports/operations/jobs/runs/<int:job_id>/logs/", OperationsRunLogsAPIView.as_view(), name="reports-ops-run-logs"),
	path(
		"reports/operations/jobs/periodic-runs/<int:run_id>/logs/",
		OperationsPeriodicRunLogsAPIView.as_view(),
		name="reports-ops-periodic-run-logs",
	),
	path("reports/operations/jobs/toggle/", OperationsPeriodicJobToggleAPIView.as_view(), name="reports-ops-toggle"),
	path("reports/operations/jobs/params/", OperationsPeriodicJobParamsAPIView.as_view(), name="reports-ops-params"),
	path("reports/operations/jobs/schedule/", OperationsPeriodicJobScheduleAPIView.as_view(), name="reports-ops-schedule"),
]
