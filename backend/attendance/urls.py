from rest_framework.routers import DefaultRouter

from .views import AttendanceRecordViewSet, AttendanceSessionViewSet

router = DefaultRouter()
router.register(r"attendance/sessions", AttendanceSessionViewSet, basename="attendance-session")
router.register(r"attendance/records", AttendanceRecordViewSet, basename="attendance-record")

urlpatterns = router.urls
