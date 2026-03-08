from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
	AttendanceKpiDashboardView,
	AttendanceKpiStudentDetailView,
	AttendanceManualSheetView,
	AttendanceRecordViewSet,
	AttendanceSessionViewSet,
	AttendanceStudentStatsView,
)

router = DefaultRouter()
router.register(r"attendance/sessions", AttendanceSessionViewSet, basename="attendance-session")
router.register(r"attendance/records", AttendanceRecordViewSet, basename="attendance-record")

urlpatterns = router.urls + [
	path("attendance/stats/students/", AttendanceStudentStatsView.as_view(), name="attendance-student-stats"),
	path("attendance/stats/kpi/", AttendanceKpiDashboardView.as_view(), name="attendance-kpi-dashboard"),
	path("attendance/stats/kpi/student-detail/", AttendanceKpiStudentDetailView.as_view(), name="attendance-kpi-student-detail"),
	path("attendance/planillas/manual/", AttendanceManualSheetView.as_view(), name="attendance-manual-sheet"),
]
