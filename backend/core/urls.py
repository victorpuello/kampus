from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CampusViewSet, ConfigExportView, ConfigImportView, InstitutionViewSet

router = DefaultRouter()
router.register(r'institutions', InstitutionViewSet)
router.register(r'campuses', CampusViewSet)

urlpatterns = [
    path("config/export/", ConfigExportView.as_view(), name="config-export"),
    path("config/import/", ConfigImportView.as_view(), name="config-import"),
    path('', include(router.urls)),
]
