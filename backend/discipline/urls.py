from rest_framework.routers import DefaultRouter

from .views import DisciplineCaseViewSet

router = DefaultRouter()
router.register(r"discipline/cases", DisciplineCaseViewSet, basename="discipline-case")

urlpatterns = router.urls
