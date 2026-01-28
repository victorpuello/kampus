from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    NoveltyTypeViewSet,
    NoveltyReasonViewSet,
    NoveltyCaseViewSet,
    NoveltyCaseTransitionViewSet,
    NoveltyRequiredDocumentRuleViewSet,
    NoveltyAttachmentViewSet,
    CapacityBucketViewSet,
    GroupCapacityOverrideViewSet,
)


router = DefaultRouter()
router.register(r"types", NoveltyTypeViewSet, basename="noveltytype")
router.register(r"reasons", NoveltyReasonViewSet, basename="noveltyreason")
router.register(r"cases", NoveltyCaseViewSet, basename="noveltycase")
router.register(r"case-transitions", NoveltyCaseTransitionViewSet, basename="noveltycasetransition")
router.register(r"required-document-rules", NoveltyRequiredDocumentRuleViewSet, basename="noveltyrequireddocumentrule")
router.register(r"attachments", NoveltyAttachmentViewSet, basename="noveltyattachment")
router.register(r"capacity-buckets", CapacityBucketViewSet, basename="capacitybucket")
router.register(r"group-capacity-overrides", GroupCapacityOverrideViewSet, basename="groupcapacityoverride")

urlpatterns = [
    path("", include(router.urls)),
]
