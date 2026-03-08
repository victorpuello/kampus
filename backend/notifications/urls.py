from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet, OperationalPlanActivityViewSet

router = DefaultRouter()
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"operational-plan-activities", OperationalPlanActivityViewSet, basename="operational-plan-activity")

urlpatterns = [
    path("", include(router.urls)),
]
