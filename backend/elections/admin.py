from django.contrib import admin

from .models import (
    CandidatoContraloria,
    ElectionCensusChangeEvent,
    ElectionCensusMember,
    ElectionCensusSync,
    ElectionOpeningRecord,
    ElectionProcessCensusExclusion,
    CandidatoPersoneria,
    ElectionProcess,
    ElectionRole,
    TokenResetEvent,
    VoteAccessSession,
    VoteRecord,
    VoterToken,
)


@admin.register(ElectionProcess)
class ElectionProcessAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "status", "starts_at", "ends_at", "created_at")
    list_filter = ("status",)
    search_fields = ("name",)


@admin.register(ElectionRole)
class ElectionRoleAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "code", "process", "display_order")
    list_filter = ("process",)
    search_fields = ("title", "code")


@admin.register(CandidatoPersoneria)
class CandidatoPersoneriaAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "number", "grade", "role", "is_active", "display_order")
    list_filter = ("is_active",)
    search_fields = ("name", "number")


@admin.register(CandidatoContraloria)
class CandidatoContraloriaAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "number", "grade", "role", "is_active", "display_order")
    list_filter = ("is_active",)
    search_fields = ("name", "number")


@admin.register(VoterToken)
class VoterTokenAdmin(admin.ModelAdmin):
    list_display = ("id", "process", "status", "token_prefix", "student_grade", "student_shift", "expires_at", "used_at")
    list_filter = ("status", "process", "student_grade", "student_shift")
    search_fields = ("token_prefix", "token_hash")
    readonly_fields = ("token_hash",)


@admin.register(VoteAccessSession)
class VoteAccessSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "voter_token", "expires_at", "consumed_at", "created_at")
    list_filter = ("consumed_at",)


@admin.register(VoteRecord)
class VoteRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "process", "role", "candidate", "is_blank", "voter_token", "created_at")
    list_filter = ("process", "role", "is_blank")


@admin.register(TokenResetEvent)
class TokenResetEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "voter_token",
        "reset_by",
        "previous_status",
        "new_status",
        "created_at",
    )
    list_filter = ("previous_status", "new_status")
    search_fields = ("reason", "voter_token__token_prefix")


@admin.register(ElectionCensusSync)
class ElectionCensusSyncAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source_name",
        "mode",
        "status",
        "received_count",
        "created_count",
        "updated_count",
        "deactivated_count",
        "errors_count",
        "started_at",
    )
    list_filter = ("mode", "status", "source_name")
    search_fields = ("source_name",)


@admin.register(ElectionCensusMember)
class ElectionCensusMemberAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student_external_id",
        "full_name",
        "document_number",
        "grade",
        "shift",
        "campus",
        "status",
        "is_active",
        "updated_at",
    )
    list_filter = ("status", "is_active", "grade", "shift", "campus")
    search_fields = ("student_external_id", "document_number", "full_name")


@admin.register(ElectionCensusChangeEvent)
class ElectionCensusChangeEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "sync",
        "student_external_id",
        "change_type",
        "created_at",
    )
    list_filter = ("change_type",)
    search_fields = ("student_external_id",)


@admin.register(ElectionOpeningRecord)
class ElectionOpeningRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "process",
        "opened_by",
        "opened_at",
        "votes_count_at_open",
        "blank_votes_count_at_open",
    )
    list_filter = ("opened_at",)
    search_fields = ("process__name", "opened_by__username")


@admin.register(ElectionProcessCensusExclusion)
class ElectionProcessCensusExclusionAdmin(admin.ModelAdmin):
    list_display = ("id", "process", "census_member", "reason", "created_by", "created_at")
    list_filter = ("process", "created_at")
    search_fields = ("process__name", "census_member__full_name", "census_member__document_number")
