from rest_framework.routers import DefaultRouter

from .views import ReportJobViewSet

router = DefaultRouter()
router.register(r"reports/jobs", ReportJobViewSet, basename="report-jobs")

urlpatterns = router.urls
