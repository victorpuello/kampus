from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CampusViewSet,
    ConfigExportView,
    ConfigImportView,
    SystemBackupsDeleteView,
    InstitutionViewSet,
    SystemBackupsDownloadView,
    SystemBackupsRestoreView,
    SystemBackupsUploadView,
    SystemBackupsView,
)

router = DefaultRouter()
router.register(r'institutions', InstitutionViewSet)
router.register(r'campuses', CampusViewSet)

urlpatterns = [
    path("config/export/", ConfigExportView.as_view(), name="config-export"),
    path("config/import/", ConfigImportView.as_view(), name="config-import"),
    path("system/backups/", SystemBackupsView.as_view(), name="system-backups"),
    path("system/backups/upload/", SystemBackupsUploadView.as_view(), name="system-backups-upload"),
    path("system/backups/restore/", SystemBackupsRestoreView.as_view(), name="system-backups-restore"),
    path(
        "system/backups/<str:filename>/download/",
        SystemBackupsDownloadView.as_view(),
        name="system-backups-download",
    ),
    path(
        "system/backups/<str:filename>/",
        SystemBackupsDeleteView.as_view(),
        name="system-backups-delete",
    ),
    path('', include(router.urls)),
]
