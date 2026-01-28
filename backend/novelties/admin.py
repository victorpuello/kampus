from django.contrib import admin

from .models import (
    NoveltyType,
    NoveltyReason,
    NoveltyCase,
    NoveltyCaseTransition,
    NoveltyRequiredDocumentRule,
    NoveltyAttachment,
    CapacityBucket,
    GroupCapacityOverride,
    NoveltyReversion,
)


@admin.register(NoveltyType)
class NoveltyTypeAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active", "created_at")
    search_fields = ("code", "name")
    list_filter = ("is_active",)


@admin.register(NoveltyReason)
class NoveltyReasonAdmin(admin.ModelAdmin):
    list_display = ("name", "novelty_type", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active", "novelty_type")


@admin.register(NoveltyCase)
class NoveltyCaseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "institution",
        "student",
        "novelty_type",
        "status",
        "radicado",
        "filed_at",
        "requested_at",
        "created_at",
    )
    list_filter = ("status", "novelty_type")
    search_fields = ("radicado", "student__document_number", "student__user__first_name", "student__user__last_name")


@admin.register(NoveltyCaseTransition)
class NoveltyCaseTransitionAdmin(admin.ModelAdmin):
    list_display = ("case", "from_status", "to_status", "actor", "created_at")
    list_filter = ("from_status", "to_status")
    search_fields = ("case__radicado", "comment")


@admin.register(NoveltyRequiredDocumentRule)
class NoveltyRequiredDocumentRuleAdmin(admin.ModelAdmin):
    list_display = ("novelty_type", "novelty_reason", "doc_type", "is_required", "visibility")
    list_filter = ("novelty_type", "is_required", "visibility")
    search_fields = ("doc_type",)


@admin.register(NoveltyAttachment)
class NoveltyAttachmentAdmin(admin.ModelAdmin):
    list_display = ("case", "doc_type", "visibility", "uploaded_by", "uploaded_at")
    list_filter = ("visibility", "doc_type")
    search_fields = ("case__radicado", "doc_type")


@admin.register(CapacityBucket)
class CapacityBucketAdmin(admin.ModelAdmin):
    list_display = ("campus", "grade", "academic_year", "shift", "modality", "capacity", "is_active", "updated_at")
    list_filter = ("academic_year", "campus", "grade", "shift", "is_active")
    search_fields = ("modality",)


@admin.register(GroupCapacityOverride)
class GroupCapacityOverrideAdmin(admin.ModelAdmin):
    list_display = ("group", "capacity", "is_active", "updated_at")
    list_filter = ("is_active",)


@admin.register(NoveltyReversion)
class NoveltyReversionAdmin(admin.ModelAdmin):
    list_display = ("case", "reverted_by", "reverted_at")
    search_fields = ("case__radicado", "comment")
