import json
import os
import shutil
import tempfile
import logging
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse

from .models import Institution, Campus
from .serializers import InstitutionSerializer, CampusSerializer
from .permissions import KampusModelPermissions, IsAdminOrReadOnly
from users.permissions import IsAdmin
from core.utils.config_transfer import export_config, import_config

logger = logging.getLogger(__name__)

class InstitutionViewSet(viewsets.ModelViewSet):
    queryset = Institution.objects.all()
    serializer_class = InstitutionSerializer
    permission_classes = [KampusModelPermissions]

class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [KampusModelPermissions]


def _parse_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
    return default


class ConfigExportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        include_media = _parse_bool(request.query_params.get("include_media"), default=False)
        payload = export_config(include_media=include_media)

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"kampus_config_{ts}.json"

        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        resp = HttpResponse(body, content_type="application/json; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp


class ConfigImportView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        overwrite = _parse_bool(request.data.get("overwrite"), default=False)
        confirm_overwrite = _parse_bool(request.data.get("confirm_overwrite"), default=False)
        dry_run = _parse_bool(request.data.get("dry_run"), default=False)

        if overwrite and not confirm_overwrite:
            return Response(
                {"detail": "Para usar overwrite debes confirmar con confirm_overwrite=true."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = None
        file_obj = request.FILES.get("file")
        if file_obj is not None:
            try:
                payload = json.loads(file_obj.read().decode("utf-8"))
            except Exception:
                return Response(
                    {"detail": "Archivo inválido: debe ser JSON UTF-8."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Allow raw JSON body
            if isinstance(request.data, dict) and "schema_version" in request.data:
                payload = request.data

        if payload is None:
            return Response(
                {"detail": "Debes enviar un archivo en 'file' o un JSON válido en el body."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = import_config(payload, overwrite=overwrite, dry_run=dry_run)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "dry_run": dry_run,
                "overwrite": overwrite,
                "created": result.created,
                "skipped": result.skipped,
            },
            status=status.HTTP_200_OK,
        )


def _backups_dir() -> Path:
    media_root = getattr(settings, "MEDIA_ROOT", None)
    base = Path(media_root) if media_root else Path(getattr(settings, "BASE_DIR", Path.cwd())) / "media"
    out = (base / "backups").resolve()
    out.mkdir(parents=True, exist_ok=True)
    return out


def _media_root_dir() -> Path:
    media_root = getattr(settings, "MEDIA_ROOT", None)
    base = Path(media_root) if media_root else Path(getattr(settings, "BASE_DIR", Path.cwd())) / "media"
    out = base.resolve()
    out.mkdir(parents=True, exist_ok=True)
    return out


def _safe_backup_path(filename: str) -> Path:
    # Prevent path traversal.
    filename = (filename or "").strip()
    if not filename:
        raise ValueError("Filename requerido")
    if "/" in filename or "\\" in filename:
        raise ValueError("Filename inválido")

    root = _backups_dir()
    candidate = (root / filename).resolve()
    if candidate.parent != root:
        raise ValueError("Filename inválido")
    return candidate


def _parse_mode(value: str | None) -> str:
    mode = (value or "").strip().lower()
    if mode in {"restore", "import"}:
        return mode
    return "import"


def _fixture_contains_model(input_path: Path, model_label: str) -> bool:
    needle = f'"model": "{model_label}"'
    if input_path.suffix == ".gz":
        import gzip

        opener = lambda: gzip.open(input_path, mode="rt", encoding="utf-8", errors="ignore")
    else:
        opener = lambda: input_path.open(mode="rt", encoding="utf-8", errors="ignore")

    with opener() as fp:
        for chunk in fp:
            if needle in chunk:
                return True
    return False


def _restore_from_fixture(path: Path, *, flush: bool) -> None:
    if flush:
        call_command(
            "flush",
            database="default",
            interactive=False,
        )

        # Django recrea automáticamente contenttypes/permisos tras el flush.
        # Si el fixture también los contiene, loaddata puede fallar por duplicados.
        fixture_has_contenttypes = _fixture_contains_model(path, "contenttypes.contenttype")
        fixture_has_permissions = _fixture_contains_model(path, "auth.permission")

        if fixture_has_contenttypes or fixture_has_permissions:
            if fixture_has_contenttypes:
                from django.contrib.contenttypes.models import ContentType

                ContentType.objects.all().delete()

            if fixture_has_permissions:
                from django.contrib.auth.models import Permission

                Permission.objects.all().delete()

    call_command(
        "loaddata",
        str(path),
        database="default",
    )


def _zip_write_media(zf: ZipFile, media_root: Path) -> None:
    backups_dir = _backups_dir()

    for p in media_root.rglob("*"):
        if not p.is_file():
            continue

        # Avoid including the backups folder inside the backup itself.
        try:
            p.resolve().relative_to(backups_dir)
            continue
        except Exception:
            pass

        try:
            rel = p.resolve().relative_to(media_root)
        except Exception:
            continue

        if not rel.parts:
            continue
        if rel.parts[0] == "backups":
            continue

        zf.write(p, arcname=f"media/{rel.as_posix()}")


def _safe_extract_members(zf: ZipFile, dest_dir: Path, members: list[str]) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)

    for name in members:
        if not name or name.endswith("/"):
            continue
        if name.startswith("/") or name.startswith("\\"):
            raise ValueError("ZIP inválido")

        target = (dest_dir / name).resolve()
        if dest_dir != target and dest_dir not in target.parents:
            raise ValueError("ZIP inválido")

        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(name) as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst)


def _restore_media_from_dir(src_media_dir: Path, *, flush_media: bool) -> None:
    media_root = _media_root_dir()

    if flush_media:
        for child in media_root.iterdir():
            if child.name == "backups":
                continue
            try:
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
            except FileNotFoundError:
                continue

    if not src_media_dir.exists() or not src_media_dir.is_dir():
        return

    for p in src_media_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(src_media_dir)
        dest = (media_root / rel).resolve()
        if media_root != dest and media_root not in dest.parents:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)


def _restore_from_bundle_zip(path: Path, *, flush_db: bool, flush_media: bool) -> None:
    with ZipFile(path, mode="r") as zf:
        members = [i.filename for i in zf.infolist()]

        db_member = None
        if "db.json.gz" in members:
            db_member = "db.json.gz"
        elif "db.json" in members:
            db_member = "db.json"
        else:
            # Best-effort: pick a top-level json/json.gz that isn't under media/
            candidates = [
                m
                for m in members
                if (m.endswith(".json") or m.endswith(".json.gz")) and not m.startswith("media/")
            ]
            db_member = candidates[0] if candidates else None

        media_members = [m for m in members if m.startswith("media/")]

        if not db_member:
            raise ValueError("El ZIP no contiene un fixture de base de datos.")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            _safe_extract_members(zf, tmp_dir, [db_member] + media_members)

            db_path = (tmp_dir / db_member).resolve()
            _restore_from_fixture(db_path, flush=flush_db)

            media_dir = (tmp_dir / "media").resolve()
            _restore_media_from_dir(media_dir, flush_media=flush_media)


class SystemBackupsView(APIView):
    """Admin-only system backups stored in MEDIA_ROOT/backups.

    - DB-only backups: .json/.json.gz
    - Full backups (DB + media): .zip (contains db.json.gz and media/)
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        root = _backups_dir()
        items = []
        for p in sorted(root.glob("*")):
            if not p.is_file():
                continue
            if p.name.startswith("."):
                continue

            # Only expose likely backup files.
            if not (p.name.endswith(".json") or p.name.endswith(".json.gz") or p.name.endswith(".zip")):
                continue

            st = p.stat()
            items.append(
                {
                    "filename": p.name,
                    "size_bytes": st.st_size,
                    "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
                }
            )

        # Newest first
        items.sort(key=lambda x: x["created_at"], reverse=True)
        return Response({"results": items}, status=status.HTTP_200_OK)

    def post(self, request):
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        include_media = _parse_bool(request.data.get("include_media"), default=True)

        excludes = ["admin.logentry", "sessions"]

        if include_media:
            filename = f"backup_{ts}.zip"
            out_path = _safe_backup_path(filename)

            import gzip

            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                db_path = (tmp_dir / "db.json.gz").resolve()
                with gzip.open(db_path, mode="wt", encoding="utf-8") as gz:
                    call_command(
                        "dumpdata",
                        stdout=gz,
                        indent=2,
                        database="default",
                        exclude=excludes,
                    )

                with ZipFile(out_path, mode="w", compression=ZIP_DEFLATED) as zf:
                    zf.write(db_path, arcname="db.json.gz")
                    zf.writestr(
                        "manifest.json",
                        json.dumps(
                            {
                                "type": "kampus-backup-bundle",
                                "created_at": datetime.utcnow().isoformat() + "Z",
                                "includes": {"db": True, "media": True},
                            },
                            ensure_ascii=False,
                            indent=2,
                        ),
                    )

                    media_root = _media_root_dir()
                    _zip_write_media(zf, media_root)

            return Response(
                {
                    "filename": out_path.name,
                    "size_bytes": out_path.stat().st_size,
                },
                status=status.HTTP_201_CREATED,
            )

        filename = f"db_backup_{ts}.json.gz"
        out_path = _safe_backup_path(filename)

        import gzip

        with gzip.open(out_path, mode="wt", encoding="utf-8") as gz:
            call_command(
                "dumpdata",
                stdout=gz,
                indent=2,
                database="default",
                exclude=excludes,
            )

        return Response(
            {
                "filename": out_path.name,
                "size_bytes": out_path.stat().st_size,
            },
            status=status.HTTP_201_CREATED,
        )


class SystemBackupsDownloadView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, filename: str):
        try:
            path = _safe_backup_path(filename)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if not path.exists() or not path.is_file():
            return Response({"detail": "Backup no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if path.name.endswith(".zip"):
            content_type = "application/zip"
        elif path.name.endswith(".gz"):
            content_type = "application/gzip"
        else:
            content_type = "application/json"
        resp = FileResponse(open(path, "rb"), content_type=content_type)
        resp["Content-Disposition"] = f'attachment; filename="{path.name}"'
        return resp


class SystemBackupsRestoreView(APIView):
    """Restore/import from an existing backup file stored on server."""

    permission_classes = [IsAdmin]

    def post(self, request):
        filename = (request.data.get("filename") or "").strip()
        mode = _parse_mode(request.data.get("mode"))
        confirm = _parse_bool(request.data.get("confirm"), default=False)

        if not filename:
            return Response({"detail": "filename es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        flush = mode == "restore"
        if flush and not confirm:
            return Response(
                {"detail": "Operación destructiva. Confirma con confirm=true."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            path = _safe_backup_path(filename)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if not path.exists() or not path.is_file():
            return Response({"detail": "Backup no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        try:
            if path.name.endswith(".zip"):
                _restore_from_bundle_zip(path, flush_db=flush, flush_media=flush)
            else:
                _restore_from_fixture(path, flush=flush)
        except (ValueError, CommandError) as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error restoring backup '%s'", path.name)
            detail = "Error interno restaurando el backup. Revisa logs del backend."
            if getattr(settings, "DEBUG", False):
                detail = f"{detail} ({type(e).__name__}: {e})"
            return Response({"detail": detail}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"detail": "OK", "mode": mode, "filename": path.name}, status=status.HTTP_200_OK)


class SystemBackupsUploadView(APIView):
    """Import/restore from an uploaded fixture file (json or json.gz)."""

    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        mode = _parse_mode(request.data.get("mode"))
        confirm = _parse_bool(request.data.get("confirm"), default=False)
        flush = mode == "restore"
        if flush and not confirm:
            return Response(
                {"detail": "Operación destructiva. Confirma con confirm=true."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_obj = request.FILES.get("file")
        if file_obj is None:
            return Response({"detail": "Debes enviar un archivo en 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        original_name = os.path.basename(getattr(file_obj, "name", "backup.json"))
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_name = f"uploaded_{ts}_{original_name}"

        out_path = _safe_backup_path(safe_name)
        with open(out_path, "wb") as fp:
            for chunk in file_obj.chunks():
                fp.write(chunk)

        try:
            if out_path.name.endswith(".zip"):
                _restore_from_bundle_zip(out_path, flush_db=flush, flush_media=flush)
            else:
                _restore_from_fixture(out_path, flush=flush)
        except (ValueError, CommandError) as e:
            return Response({"detail": str(e), "filename": out_path.name}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error uploading/restoring backup '%s'", out_path.name)
            detail = "Error interno restaurando el backup. Revisa logs del backend."
            if getattr(settings, "DEBUG", False):
                detail = f"{detail} ({type(e).__name__}: {e})"
            return Response({"detail": detail, "filename": out_path.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"detail": "OK", "mode": mode, "filename": out_path.name}, status=status.HTTP_200_OK)
