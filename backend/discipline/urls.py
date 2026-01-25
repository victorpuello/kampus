from rest_framework.routers import DefaultRouter

from .views import DisciplineCaseViewSet
from .manual_views import ManualConvivenciaViewSet

router = DefaultRouter()
router.register(r"discipline/cases", DisciplineCaseViewSet, basename="discipline-case")
router.register(r"discipline/manual", ManualConvivenciaViewSet, basename="convivencia-manual")

urlpatterns = router.urls
