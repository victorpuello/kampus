from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_event, log_public_event
from verification.throttles import PublicVerifyRateThrottle
from core.models import Institution

from .models import ElectionProcess, TokenResetEvent, VoterToken
from .permissions import CanResetElectionToken
from .serializers import (
    ElectionRolePublicSerializer,
    PublicResetTokenInputSerializer,
    PublicSubmitVoteInputSerializer,
    PublicValidateTokenInputSerializer,
    TokenResetEventSerializer,
    build_or_reuse_access_session,
    get_voter_token_census_eligibility_error,
    reset_voter_token_with_audit,
)


class PublicValidateTokenAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicVerifyRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = PublicValidateTokenInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_token = serializer.validated_data["token"]
        token_hashes = VoterToken.hash_token_candidates(raw_token)
        if not token_hashes:
            return Response({"detail": "No se encontró el token de votación."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            voter_token = (
                VoterToken.objects.select_for_update()
                .select_related("process")
                .filter(token_hash__in=token_hashes)
                .first()
            )
            if voter_token is None:
                return Response({"detail": "No se encontró el token de votación."}, status=status.HTTP_404_NOT_FOUND)

            token_status = voter_token.ensure_fresh_status()
            if token_status != VoterToken.Status.ACTIVE:
                status_map = {
                    VoterToken.Status.USED: status.HTTP_409_CONFLICT,
                    VoterToken.Status.REVOKED: status.HTTP_403_FORBIDDEN,
                    VoterToken.Status.EXPIRED: status.HTTP_410_GONE,
                }
                return Response(
                    {"detail": "El token no se encuentra disponible para votar.", "status": token_status},
                    status=status_map.get(token_status, status.HTTP_400_BAD_REQUEST),
                )

            process: ElectionProcess = voter_token.process
            if not process.is_open():
                return Response(
                    {"detail": "La jornada electoral no se encuentra abierta en este momento."},
                    status=status.HTTP_409_CONFLICT,
                )

            census_error = get_voter_token_census_eligibility_error(voter_token)
            if census_error:
                return Response({"detail": census_error}, status=status.HTTP_403_FORBIDDEN)

            access_session = build_or_reuse_access_session(voter_token)
            roles = process.roles.all().order_by("display_order", "id")
            roles_data = ElectionRolePublicSerializer(roles, many=True, context={"request": request}).data

        return Response(
            {
                "access_session_id": str(access_session.id),
                "process": {
                    "id": process.id,
                    "name": process.name,
                },
                "roles": roles_data,
                "student_scope": {
                    "grade": voter_token.student_grade,
                    "shift": voter_token.student_shift,
                },
            }
        )


class PublicVotingBrandingAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        institution = Institution.objects.order_by("id").first()
        if institution is None:
            return Response({"institution_name": None, "logo_url": None})

        logo_url = None
        if getattr(institution, "logo", None):
            try:
                logo_url = request.build_absolute_uri(institution.logo.url)
            except Exception:
                logo_url = None

        return Response(
            {
                "institution_name": institution.name or None,
                "logo_url": logo_url,
            }
        )


class PublicSubmitVoteAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicVerifyRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = PublicSubmitVoteInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        response_status = status.HTTP_200_OK if bool(result.get("already_submitted")) else status.HTTP_201_CREATED
        event_type = "ELECTION_VOTE_SUBMIT_DUPLICATE" if bool(result.get("already_submitted")) else "ELECTION_VOTE_SUBMIT"
        process_id = result.get("process_id")
        object_id = str(process_id) if process_id is not None else ""
        log_public_event(
            request,
            event_type=event_type,
            object_type="ElectionProcess",
            object_id=object_id,
            status_code=response_status,
            metadata={
                "process_id": process_id,
                "saved_votes": int(result.get("saved_votes") or 0),
                "already_submitted": bool(result.get("already_submitted")),
            },
        )
        return Response(result, status=response_status)


class ResetVoterTokenAPIView(APIView):
    permission_classes = [IsAuthenticated, CanResetElectionToken]

    def post(self, request, *args, **kwargs):
        serializer = PublicResetTokenInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_token = serializer.validated_data["token"]
        token_hashes = VoterToken.hash_token_candidates(raw_token)
        reason = serializer.validated_data["reason"]
        extend_hours = serializer.validated_data.get("extend_hours", 8)

        if not token_hashes:
            return Response({"detail": "No se encontró el token de votación."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            voter_token = VoterToken.objects.select_for_update().filter(token_hash__in=token_hashes).first()
            if voter_token is None:
                log_event(
                    request,
                    event_type="ELECTION_TOKEN_RESET_NOT_FOUND",
                    object_type="VoterToken",
                    object_id="",
                    status_code=status.HTTP_404_NOT_FOUND,
                    metadata={"token_prefix": VoterToken.normalize_token_input(raw_token)[:12], "reason": reason},
                )
                return Response({"detail": "No se encontró el token de votación."}, status=status.HTTP_404_NOT_FOUND)

            reset_event = reset_voter_token_with_audit(
                voter_token=voter_token,
                reason=reason,
                reset_by=request.user,
                extend_hours=extend_hours,
            )

        log_event(
            request,
            event_type="ELECTION_TOKEN_RESET",
            object_type="VoterToken",
            object_id=voter_token.id,
            status_code=status.HTTP_200_OK,
            metadata={
                "token_prefix": voter_token.token_prefix,
                "reason": reason,
                "reset_event_id": reset_event.id,
                "new_status": voter_token.status,
                "new_expires_at": voter_token.expires_at.isoformat() if voter_token.expires_at else None,
            },
        )

        return Response(
            {
                "detail": "Token reseteado correctamente.",
                "token_id": voter_token.id,
                "token_prefix": voter_token.token_prefix,
                "status": voter_token.status,
                "expires_at": voter_token.expires_at,
                "reset_event_id": reset_event.id,
            }
        )


class TokenResetEventListAPIView(APIView):
    permission_classes = [IsAuthenticated, CanResetElectionToken]

    def get(self, request, *args, **kwargs):
        raw_limit = request.query_params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 20
        except (TypeError, ValueError):
            limit = 20

        limit = max(1, min(limit, 100))

        queryset = (
            TokenResetEvent.objects.select_related("reset_by", "voter_token")
            .order_by("-created_at", "-id")[:limit]
        )

        serializer = TokenResetEventSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})
