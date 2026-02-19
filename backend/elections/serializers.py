from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from students.models import Student

from .models import (
    CandidatoContraloria,
    CandidatoPersoneria,
    ElectionCandidate,
    ElectionCensusMember,
    ElectionOpeningRecord,
    ElectionProcess,
    ElectionRole,
    TokenResetEvent,
    VoteAccessSession,
    VoteRecord,
    VoterToken,
)


class ElectionProcessManageSerializer(serializers.ModelSerializer):
    votes_count = serializers.IntegerField(read_only=True)
    can_delete = serializers.SerializerMethodField()
    observer_congrats_generated = serializers.SerializerMethodField()
    observer_congrats_summary = serializers.SerializerMethodField()

    class Meta:
        model = ElectionProcess
        fields = [
            "id",
            "name",
            "status",
            "starts_at",
            "ends_at",
            "created_at",
            "votes_count",
            "can_delete",
            "observer_congrats_generated",
            "observer_congrats_summary",
        ]

    def get_can_delete(self, obj: ElectionProcess) -> bool:
        return int(getattr(obj, "votes_count", 0) or 0) == 0

    def _get_observer_congrats_summary(self, obj: ElectionProcess) -> dict | None:
        context = self.context if isinstance(self.context, dict) else {}
        summary_by_process = context.get("observer_congrats_summary_by_process") or {}
        summary = summary_by_process.get(int(obj.id))
        return summary if isinstance(summary, dict) else None

    def get_observer_congrats_generated(self, obj: ElectionProcess) -> bool:
        return self._get_observer_congrats_summary(obj) is not None

    def get_observer_congrats_summary(self, obj: ElectionProcess) -> dict | None:
        return self._get_observer_congrats_summary(obj)


class ElectionProcessCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ElectionProcess
        fields = ["name", "status", "starts_at", "ends_at"]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at")
        ends_at = attrs.get("ends_at")
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError({"ends_at": "La fecha de fin no puede ser anterior a la fecha de inicio."})
        attrs["status"] = ElectionProcess.Status.DRAFT
        return attrs


class ElectionProcessUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ElectionProcess
        fields = ["starts_at", "ends_at"]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", self.instance.starts_at if self.instance else None)
        ends_at = attrs.get("ends_at", self.instance.ends_at if self.instance else None)
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError({"ends_at": "La fecha de fin no puede ser anterior a la fecha de inicio."})
        return attrs


class ElectionRoleManageSerializer(serializers.ModelSerializer):
    process_name = serializers.CharField(source="process.name", read_only=True)
    votes_count = serializers.IntegerField(read_only=True)
    candidates_count = serializers.IntegerField(read_only=True)
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = ElectionRole
        fields = [
            "id",
            "process",
            "process_name",
            "code",
            "title",
            "description",
            "display_order",
            "created_at",
            "votes_count",
            "candidates_count",
            "can_delete",
        ]

    def get_can_delete(self, obj: ElectionRole) -> bool:
        votes_count = int(getattr(obj, "votes_count", 0) or 0)
        candidates_count = int(getattr(obj, "candidates_count", 0) or 0)
        return votes_count == 0 and candidates_count == 0


class ElectionRoleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ElectionRole
        fields = ["process", "code", "title", "description", "display_order"]


class ElectionOpeningRecordSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ElectionOpeningRecord
        fields = [
            "id",
            "process",
            "opened_by",
            "opened_by_name",
            "opened_at",
            "votes_count_at_open",
            "blank_votes_count_at_open",
            "metadata",
        ]

    def get_opened_by_name(self, obj: ElectionOpeningRecord) -> str:
        if not obj.opened_by:
            return ""
        return obj.opened_by.get_full_name() or obj.opened_by.username


class ElectionCandidateManageSerializer(serializers.ModelSerializer):
    role_title = serializers.CharField(source="role.title", read_only=True)
    process_id = serializers.IntegerField(source="role.process_id", read_only=True)

    class Meta:
        model = ElectionCandidate
        fields = [
            "id",
            "role",
            "role_title",
            "process_id",
            "name",
            "student_id_ref",
            "student_document_number",
            "number",
            "grade",
            "proposal",
            "display_order",
            "is_active",
            "created_at",
        ]


class ElectionTokenEligibilityIssueSerializer(serializers.Serializer):
    token_id = serializers.IntegerField()
    process_id = serializers.IntegerField()
    process_name = serializers.CharField()
    token_prefix = serializers.CharField()
    status = serializers.CharField()
    student_grade = serializers.CharField(allow_blank=True)
    student_shift = serializers.CharField(allow_blank=True)
    metadata = serializers.JSONField()
    error = serializers.CharField()


class CandidatoPersoneriaCreateSerializer(serializers.ModelSerializer):
    student_id_ref = serializers.IntegerField(required=False, allow_null=True)
    student_document_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = CandidatoPersoneria
        fields = [
            "role",
            "name",
            "student_id_ref",
            "student_document_number",
            "number",
            "grade",
            "proposal",
            "display_order",
            "is_active",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return validate_candidate_identity_uniqueness(attrs)


class CandidatoContraloriaCreateSerializer(serializers.ModelSerializer):
    student_id_ref = serializers.IntegerField(required=False, allow_null=True)
    student_document_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = CandidatoContraloria
        fields = [
            "role",
            "name",
            "student_id_ref",
            "student_document_number",
            "number",
            "grade",
            "proposal",
            "display_order",
            "is_active",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return validate_candidate_identity_uniqueness(attrs)


def validate_candidate_identity_uniqueness(attrs: dict) -> dict:
    role: ElectionRole | None = attrs.get("role")
    if role is None:
        return attrs

    candidate_name = str(attrs.get("name") or "").strip()
    student_id_ref = attrs.get("student_id_ref")
    student_document_number = str(attrs.get("student_document_number") or "").strip()
    attrs["student_document_number"] = student_document_number

    if not student_id_ref and not student_document_number:
        raise serializers.ValidationError(
            {
                "student_id_ref": (
                    "Debes seleccionar un estudiante elegible desde la búsqueda predictiva para registrar la candidatura."
                )
            }
        )

    same_process_queryset = ElectionCandidate.objects.filter(role__process_id=role.process_id)
    same_role_queryset = same_process_queryset.filter(role__code=role.code)
    other_role_queryset = same_process_queryset.exclude(role__code=role.code)

    if candidate_name:
        same_name_in_other_role = other_role_queryset.filter(name__iexact=candidate_name).exists()
        if same_name_in_other_role:
            raise serializers.ValidationError(
                {
                    "name": (
                        "Esta candidatura ya está registrada en otro cargo de la misma jornada y no puede aspirar a dos cargos."
                    )
                }
            )

    if student_id_ref:
        if same_role_queryset.filter(student_id_ref=student_id_ref).exists():
            raise serializers.ValidationError(
                {"student_id_ref": "Este estudiante ya está registrado como candidato para este cargo en la jornada seleccionada."}
            )

        if other_role_queryset.filter(student_id_ref=student_id_ref).exists():
            raise serializers.ValidationError(
                {
                    "student_id_ref": (
                        "Este estudiante ya está inscrito en otro cargo de la misma jornada y no puede aspirar a dos cargos."
                    )
                }
            )

    if student_document_number:
        if same_role_queryset.filter(student_document_number__iexact=student_document_number).exists():
            raise serializers.ValidationError(
                {
                    "student_document_number": (
                        "Ya existe una candidatura para este cargo en la jornada con el mismo documento de estudiante."
                    )
                }
            )

        if other_role_queryset.filter(student_document_number__iexact=student_document_number).exists():
            raise serializers.ValidationError(
                {
                    "student_document_number": (
                        "Este estudiante ya está inscrito en otro cargo de la misma jornada y no puede aspirar a dos cargos."
                    )
                }
            )

    return attrs


class ElectionCandidatePublicSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ElectionCandidate
        fields = ["id", "name", "number", "grade", "proposal", "photo_url"]

    def _build_student_photo_url(self, student: Student | None) -> str:
        if student is None:
            return ""

        image_field = None
        if getattr(student, "photo_thumb", None) and getattr(student.photo_thumb, "url", None):
            image_field = student.photo_thumb
        elif getattr(student, "photo", None) and getattr(student.photo, "url", None):
            image_field = student.photo

        if image_field is None:
            return ""

        image_url = image_field.url
        request = self.context.get("request") if isinstance(self.context, dict) else None
        if request is not None:
            return request.build_absolute_uri(image_url)
        return image_url

    def get_photo_url(self, obj: ElectionCandidate) -> str:
        context = self.context if isinstance(self.context, dict) else {}

        student_photo_by_id = context.get("student_photo_by_id") or {}
        if obj.student_id_ref and obj.student_id_ref in student_photo_by_id:
            return student_photo_by_id[obj.student_id_ref]

        student_photo_by_doc = context.get("student_photo_by_doc") or {}
        normalized_doc = str(obj.student_document_number or "").strip().upper()
        if normalized_doc and normalized_doc in student_photo_by_doc:
            return student_photo_by_doc[normalized_doc]

        student = None
        if obj.student_id_ref:
            student = Student.objects.filter(user_id=obj.student_id_ref).first()
        if student is None and normalized_doc:
            student = Student.objects.filter(document_number__iexact=normalized_doc).first()

        return self._build_student_photo_url(student)


class ElectionRolePublicSerializer(serializers.ModelSerializer):
    candidates = serializers.SerializerMethodField()

    class Meta:
        model = ElectionRole
        fields = ["id", "code", "title", "description", "display_order", "candidates"]

    def get_candidates(self, obj: ElectionRole):
        role_code = (obj.code or "").strip().upper()
        if role_code == ElectionRole.CODE_PERSONERO:
            candidates = CandidatoPersoneria.objects.filter(role=obj, is_active=True).order_by("display_order", "id")
        elif role_code == ElectionRole.CODE_CONTRALOR:
            candidates = CandidatoContraloria.objects.filter(role=obj, is_active=True).order_by("display_order", "id")
        else:
            candidates = ElectionCandidate.objects.none()

        candidate_rows = list(candidates)
        student_ids = [candidate.student_id_ref for candidate in candidate_rows if candidate.student_id_ref]
        document_numbers = [
            str(candidate.student_document_number or "").strip()
            for candidate in candidate_rows
            if str(candidate.student_document_number or "").strip()
        ]

        students = Student.objects.none()
        if student_ids or document_numbers:
            students = Student.objects.filter(
                Q(user_id__in=student_ids) | Q(document_number__in=document_numbers)
            )

        serializer_context = dict(self.context)
        student_photo_by_id: dict[int, str] = {}
        student_photo_by_doc: dict[str, str] = {}

        candidate_serializer = ElectionCandidatePublicSerializer(context=serializer_context)
        for student in students:
            photo_url = candidate_serializer._build_student_photo_url(student)
            if not photo_url:
                continue
            student_photo_by_id[int(student.user_id)] = photo_url
            normalized_doc = str(student.document_number or "").strip().upper()
            if normalized_doc:
                student_photo_by_doc[normalized_doc] = photo_url

        serializer_context["student_photo_by_id"] = student_photo_by_id
        serializer_context["student_photo_by_doc"] = student_photo_by_doc

        return ElectionCandidatePublicSerializer(candidate_rows, many=True, context=serializer_context).data


class PublicValidateTokenInputSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)


class PublicSubmitVoteSelectionSerializer(serializers.Serializer):
    role_id = serializers.IntegerField()
    candidate_id = serializers.IntegerField(required=False, allow_null=True)
    is_blank = serializers.BooleanField(default=False)


class PublicSubmitVoteInputSerializer(serializers.Serializer):
    access_session_id = serializers.UUIDField()
    selections = PublicSubmitVoteSelectionSerializer(many=True)

    def validate(self, attrs):
        selections = attrs.get("selections") or []
        if not selections:
            raise serializers.ValidationError({"selections": "Debes registrar al menos una selección de voto."})

        role_ids = [item["role_id"] for item in selections]
        if len(role_ids) != len(set(role_ids)):
            raise serializers.ValidationError({"selections": "Solo puedes registrar una selección por cada cargo."})

        for item in selections:
            candidate_id = item.get("candidate_id")
            is_blank = bool(item.get("is_blank", False))
            if not is_blank and not candidate_id:
                raise serializers.ValidationError(
                    {"selections": "Cada selección debe indicar una candidatura o marcar voto en blanco."}
                )

        return attrs

    def save(self, **kwargs):
        validated = self.validated_data
        now = timezone.now()

        def _build_idempotent_response(*, access_session: VoteAccessSession, votes_count: int) -> dict:
            submitted_at = access_session.consumed_at or now
            receipt = f"VOTO-{submitted_at.year}-{str(access_session.id).split('-')[0].upper()}"
            return {
                "receipt_code": receipt,
                "saved_votes": votes_count,
                "submitted_at": submitted_at,
                "process_id": access_session.voter_token.process_id,
                "already_submitted": True,
            }

        with transaction.atomic():
            access_session = (
                VoteAccessSession.objects.select_for_update()
                .select_related("voter_token", "voter_token__process")
                .filter(id=validated["access_session_id"])
                .first()
            )
            if access_session is None:
                raise serializers.ValidationError({"access_session_id": "La sesión de votación no fue encontrada."})

            existing_votes_count = VoteRecord.objects.filter(access_session=access_session).count()
            if existing_votes_count > 0:
                if access_session.consumed_at is None:
                    access_session.consumed_at = now
                    access_session.save(update_fields=["consumed_at"])
                return _build_idempotent_response(access_session=access_session, votes_count=existing_votes_count)

            if access_session.consumed_at is not None:
                raise serializers.ValidationError({"detail": "Esta sesión de votación ya fue utilizada."})

            if now > access_session.expires_at:
                raise serializers.ValidationError({"detail": "La sesión de votación ya expiró."})

            voter_token = (
                VoterToken.objects.select_for_update()
                .select_related("process")
                .filter(id=access_session.voter_token_id)
                .first()
            )
            if voter_token is None:
                raise serializers.ValidationError({"detail": "El token de votación no es válido."})

            token_status = voter_token.ensure_fresh_status()
            if token_status != VoterToken.Status.ACTIVE:
                raise serializers.ValidationError({"detail": "El token ya no se encuentra disponible para votar."})

            census_error = get_voter_token_census_eligibility_error(voter_token)
            if census_error:
                raise serializers.ValidationError({"detail": census_error})

            process = voter_token.process
            if not process.is_open():
                raise serializers.ValidationError({"detail": "La jornada electoral no está habilitada para recibir votos."})

            roles = list(process.roles.all().order_by("display_order", "id"))
            expected_role_ids = {role.id for role in roles}
            sent_role_ids = {item["role_id"] for item in validated["selections"]}
            if expected_role_ids != sent_role_ids:
                raise serializers.ValidationError(
                    {"selections": "Debes registrar exactamente una selección por cada cargo habilitado."}
                )

            role_map = {role.id: role for role in roles}
            records: list[VoteRecord] = []

            for item in validated["selections"]:
                role = role_map[item["role_id"]]
                candidate_id = item.get("candidate_id")
                is_blank = bool(item.get("is_blank", False))

                candidate = None
                if not is_blank:
                    role_code = (role.code or "").strip().upper()
                    candidate_queryset = ElectionCandidate.objects.none()
                    if role_code == ElectionRole.CODE_PERSONERO:
                        candidate_queryset = CandidatoPersoneria.objects
                    elif role_code == ElectionRole.CODE_CONTRALOR:
                        candidate_queryset = CandidatoContraloria.objects

                    candidate = candidate_queryset.filter(id=candidate_id, role=role, is_active=True).only("id").first()
                    if candidate is None:
                        raise serializers.ValidationError(
                            {"selections": f"La candidatura seleccionada no es válida para el cargo {role.title}."}
                        )

                records.append(
                    VoteRecord(
                        process=process,
                        role=role,
                        candidate=candidate,
                        voter_token=voter_token,
                        access_session=access_session,
                        is_blank=is_blank,
                    )
                )

            try:
                VoteRecord.objects.bulk_create(records)
            except IntegrityError:
                access_session.refresh_from_db(fields=["consumed_at"])
                collided_votes_count = VoteRecord.objects.filter(access_session=access_session).count()
                if collided_votes_count > 0:
                    if access_session.consumed_at is None:
                        access_session.consumed_at = now
                        access_session.save(update_fields=["consumed_at"])

                    voter_token.status = VoterToken.Status.USED
                    if voter_token.used_at is None:
                        voter_token.used_at = access_session.consumed_at or now
                    voter_token.save(update_fields=["status", "used_at"])

                    return _build_idempotent_response(access_session=access_session, votes_count=collided_votes_count)
                raise serializers.ValidationError({"detail": "No fue posible registrar el voto por colisión de concurrencia."})

            voter_token.status = VoterToken.Status.USED
            voter_token.used_at = now
            voter_token.save(update_fields=["status", "used_at"])

            access_session.consumed_at = now
            access_session.save(update_fields=["consumed_at"])

            receipt = f"VOTO-{now.year}-{str(access_session.id).split('-')[0].upper()}"
            return {
                "receipt_code": receipt,
                "saved_votes": len(records),
                "submitted_at": now,
                "process_id": process.id,
                "already_submitted": False,
            }


def _normalize_scope_value(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_grade_to_int(raw_grade: str | None) -> int | None:
    value = (raw_grade or "").strip().lower().replace("°", "")
    compact = value.replace(" ", "")
    mapping = {
        "primero": 1,
        "segundo": 2,
        "tercero": 3,
        "cuarto": 4,
        "quinto": 5,
        "sexto": 6,
        "septimo": 7,
        "octavo": 8,
        "noveno": 9,
        "decimo": 10,
        "once": 11,
        "undecimo": 11,
        "decimoprimero": 11,
    }

    if compact.isdigit():
        return int(compact)
    return mapping.get(compact)


def _is_grade_in_census_scope(raw_grade: str | None) -> bool:
    parsed = _normalize_grade_to_int(raw_grade)
    return parsed is not None and 1 <= parsed <= 11


def get_voter_token_census_eligibility_error(voter_token: VoterToken) -> str | None:
    if not ElectionCensusMember.objects.exists():
        return None

    metadata = voter_token.metadata if isinstance(voter_token.metadata, dict) else {}
    student_external_id = str(metadata.get("student_external_id") or metadata.get("external_id") or "").strip()
    document_number = str(metadata.get("document_number") or "").strip()

    if getattr(settings, "ELECTIONS_REQUIRE_TOKEN_IDENTITY", False) and not (student_external_id or document_number):
        return "El token no incluye identidad verificable del votante para validación electoral."

    member = None
    if student_external_id:
        member = ElectionCensusMember.objects.filter(student_external_id=student_external_id).first()
    elif document_number:
        member = ElectionCensusMember.objects.filter(document_number=document_number).first()

    if member is not None:
        if not member.is_active or member.status != ElectionCensusMember.Status.ACTIVE:
            return "El votante asociado al token no se encuentra activo en el censo electoral."

        if not _is_grade_in_census_scope(member.grade):
            return "El votante asociado al token no está en el rango de grados habilitado (1° a 11°)."

        token_grade = (voter_token.student_grade or "").strip()
        token_shift = (voter_token.student_shift or "").strip()

        if token_grade and not _is_grade_in_census_scope(token_grade):
            return "El token no está en el rango de grados habilitado (1° a 11°)."

        if token_grade and _normalize_scope_value(member.grade) != _normalize_scope_value(token_grade):
            return "El token no coincide con el grado habilitado en el censo electoral."

        if token_shift and _normalize_scope_value(member.shift) != _normalize_scope_value(token_shift):
            return "El token no coincide con la jornada habilitada en el censo electoral."

        return None

    if student_external_id or document_number:
        return "No se encontró el votante asociado al token en el censo electoral sincronizado."

    scoped_queryset = ElectionCensusMember.objects.filter(is_active=True, status=ElectionCensusMember.Status.ACTIVE)

    token_grade = (voter_token.student_grade or "").strip()
    token_shift = (voter_token.student_shift or "").strip()

    if token_grade and not _is_grade_in_census_scope(token_grade):
        return "El token no está en el rango de grados habilitado (1° a 11°)."

    if token_shift:
        scoped_queryset = scoped_queryset.filter(shift__iexact=token_shift)

    target_grade = _normalize_grade_to_int(token_grade) if token_grade else None
    for member_row in scoped_queryset.only("grade").iterator():
        member_grade = _normalize_grade_to_int(member_row.grade)
        if member_grade is None or not (1 <= member_grade <= 11):
            continue
        if target_grade is not None and member_grade != target_grade:
            continue
        return None

    return "El token no cumple criterios de elegibilidad del censo electoral sincronizado."


def build_or_reuse_access_session(voter_token: VoterToken) -> VoteAccessSession:
    now = timezone.now()

    existing = (
        voter_token.access_sessions.filter(consumed_at__isnull=True, expires_at__gt=now)
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing

    ttl_candidate = now + timedelta(minutes=15)
    expires_at = min(ttl_candidate, voter_token.expires_at) if voter_token.expires_at else ttl_candidate
    return VoteAccessSession.objects.create(voter_token=voter_token, expires_at=expires_at)


class PublicResetTokenInputSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
    reason = serializers.CharField(max_length=500)
    extend_hours = serializers.IntegerField(required=False, min_value=1, max_value=24, default=8)

    def validate_reason(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 10:
            raise serializers.ValidationError("Debes indicar un motivo claro (mínimo 10 caracteres).")
        return normalized


class TokenResetEventSerializer(serializers.ModelSerializer):
    reset_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TokenResetEvent
        fields = [
            "id",
            "reason",
            "previous_status",
            "new_status",
            "previous_expires_at",
            "new_expires_at",
            "created_at",
            "reset_by_name",
            "voter_token",
        ]

    def get_reset_by_name(self, obj: TokenResetEvent) -> str:
        if not obj.reset_by:
            return ""
        return obj.reset_by.get_full_name() or obj.reset_by.username


def reset_voter_token_with_audit(*, voter_token: VoterToken, reason: str, reset_by, extend_hours: int) -> TokenResetEvent:
    now = timezone.now()
    previous_status = voter_token.status
    previous_expires_at = voter_token.expires_at

    voter_token.status = VoterToken.Status.ACTIVE
    voter_token.used_at = None
    voter_token.revoked_at = None
    voter_token.revoked_reason = ""

    next_expires_at = now + timedelta(hours=max(1, int(extend_hours or 8)))
    if voter_token.expires_at is None or voter_token.expires_at < now:
        voter_token.expires_at = next_expires_at

    voter_token.save(update_fields=["status", "used_at", "revoked_at", "revoked_reason", "expires_at"])

    voter_token.access_sessions.filter(consumed_at__isnull=True).update(consumed_at=now)

    return TokenResetEvent.objects.create(
        voter_token=voter_token,
        reset_by=reset_by,
        reason=reason,
        previous_status=previous_status,
        new_status=voter_token.status,
        previous_expires_at=previous_expires_at,
        new_expires_at=voter_token.expires_at,
    )
