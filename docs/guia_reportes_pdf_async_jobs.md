# Guía: crear nuevos reportes PDF (WeasyPrint + ReportJob)

Esta guía explica cómo agregar un **nuevo reporte PDF** usando el flujo estándar de Kampus:

1) **Backend** crea un `ReportJob` (`POST /api/reports/jobs/`) y encola un worker Celery.
2) **Frontend** hace polling del job (`GET /api/reports/jobs/{id}/`) hasta terminar.
3) **Backend** sirve la descarga autenticada desde storage privado (`GET /api/reports/jobs/{id}/download/`).

> Objetivo: PDFs consistentes, sin bloquear requests y sin exponer archivos sensibles por `MEDIA_URL`.

---

## 1) Contrato de la API (jobs)

Endpoints (DRF router):
- `POST /api/reports/jobs/` → crea job y retorna **202**.
- `GET /api/reports/jobs/{id}/` → estado/progreso/errores.
- `POST /api/reports/jobs/{id}/cancel/` → cancela si aún no finalizó.
- `GET /api/reports/jobs/{id}/download/` → stream del PDF **solo si `SUCCEEDED`**.

Estados posibles (`status`): `PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED`.

Notas importantes:
- El queryset está filtrado: usuarios normales solo ven sus propios jobs; admins/staff ven todo.
- Hay límites básicos (defaults en código):
  - Jobs activos por usuario: `REPORT_JOBS_MAX_ACTIVE_PER_USER` (default `3`)
  - Jobs activos por admin: `REPORT_JOBS_MAX_ACTIVE_PER_ADMIN` (default `20`)
  - Jobs creados por hora: `REPORT_JOBS_MAX_CREATED_PER_HOUR` (default `30`)
  - Jobs creados por hora admin: `REPORT_JOBS_MAX_CREATED_PER_HOUR_ADMIN` (default `300`)

Ejemplo de request:
```json
POST /api/reports/jobs/
{
  "report_type": "ENROLLMENT_LIST",
  "params": { "year_id": 1, "grade_id": 2, "group_id": 3 }
}
```

---

## 2) Dónde se guardan los PDFs (storage privado)

El PDF se escribe en filesystem bajo:
- `PRIVATE_STORAGE_ROOT` (env: `KAMPUS_PRIVATE_STORAGE_ROOT`)
- subcarpeta `PRIVATE_REPORTS_DIR` (env: `KAMPUS_PRIVATE_REPORTS_DIR`, default `reports`)

Regla: **no guardar PDFs sensibles en `MEDIA_ROOT`**.

La descarga es autenticada y usa `FileResponse` con `Content-Disposition: attachment`.

Limpieza/TTL:
- TTL por defecto: `REPORT_JOBS_TTL_HOURS` (env: `KAMPUS_REPORT_JOBS_TTL_HOURS`, default `24`).
- Comando de limpieza: `python manage.py cleanup_report_jobs` (borra jobs expirados y sus archivos privados).

---

## 3) Agregar un reporte nuevo (Backend)

Checklist recomendado (en este orden):

### A) Definir el nuevo `report_type`
1. Agrega el choice en `ReportJob.ReportType`.

Archivo: [backend/reports/models.py](../backend/reports/models.py)

Ejemplo (conceptual):
```py
class ReportType(models.TextChoices):
    MY_NEW_REPORT = "MY_NEW_REPORT", "Mi reporte nuevo"
```

### B) Validar `params` y permisos
2. Implementa validación en `ReportJobCreateSerializer.validate`:
- Validar campos requeridos en `params`.
- Parsear/castear a `int`/`str` con errores claros.
- Verificar permisos (por rol y/o por relación a grupo/estudiante).

Archivo: [backend/reports/serializers.py](../backend/reports/serializers.py)

Patrón típico:
- `raise serializers.ValidationError({"params": "..."})` para errores de input.
- `raise serializers.ValidationError({"detail": "No tienes permisos..."})` para permisos.

### C) Render HTML del reporte
3. Implementa el render del HTML en el worker:
- Agrega un branch en `_render_report_html(job)`.
- Construye contexto con funciones `build_*_context` si aplica.
- Renderiza con `render_to_string(template_path, ctx)`.

Archivo: [backend/reports/tasks.py](../backend/reports/tasks.py)

Recomendación de templates:
- Si el reporte pertenece a un dominio (students/academic/discipline/…), pon el template bajo ese app, como ya se hace con:
  - `students/reports/..._pdf.html`
  - `academic/reports/..._pdf.html`
  - `attendance/reports/..._pdf.html`

### D) Generación PDF (WeasyPrint)
4. El worker convierte HTML→PDF con WeasyPrint usando:
- `PDF_BASE_CSS` como estilo base.
- `weasyprint_url_fetcher` seguro.

Archivo: [backend/reports/weasyprint_utils.py](../backend/reports/weasyprint_utils.py)

Restricción clave:
- El fetcher **bloquea URLs remotas `http(s)`** (reduce SSRF).
- Se permiten recursos locales vía `/media/...` y `/static/...` mapeados al filesystem.

### E) Nombre del archivo
5. Define un `out_filename` claro por tipo de reporte.

Archivo: [backend/reports/tasks.py](../backend/reports/tasks.py)

### F) Side effects (si aplica)
6. Si el reporte requiere “bookkeeping” (ej: certificados), hazlo después de `job.mark_succeeded(...)` y asegúrate de no romper el success del job por errores secundarios.

---

## 4) Consumir un reporte desde React (Frontend)

Cliente API existente:
- `reportsApi.createJob({ report_type, params })`
- `reportsApi.getJob(id)`
- `reportsApi.downloadJob(id)`

Archivo: [kampus_frontend/src/services/reports.ts](../kampus_frontend/src/services/reports.ts)

Patrón recomendado (create → poll → download):
- Hay un ejemplo completo en la pantalla de reportes de matrícula.

Archivo: [kampus_frontend/src/pages/enrollments/EnrollmentReports.tsx](../kampus_frontend/src/pages/enrollments/EnrollmentReports.tsx)

Snippet mínimo (idea):
```ts
const created = await reportsApi.createJob({ report_type: 'ENROLLMENT_LIST', params: {...} })
const job = await pollJobUntilFinished(created.data.id)
if (job.status !== 'SUCCEEDED') throw new Error(job.error_message || 'Falló')
const pdf = await reportsApi.downloadJob(job.id)
```

Descarga:
- El backend setea `Content-Disposition`; se puede extraer el filename y usar un `Blob` + `<a download>`.

---

## 5) Buenas prácticas

- Mantener `params` pequeños (evitar HTML gigantes; ver caps del serializer en reportes IA).
- No depender de recursos remotos (CDNs, imágenes por URL). Usar `/static` o `/media`.
- Preferir context prearmado (queries en backend) para minimizar lógica en templates.
- Incluir `expires_at` cuando sea útil (ya se setea al crear el job).

---

## 6) Debug rápido

- Verificar worker:
  - Docker: `backend_worker` debe estar arriba (Celery + Redis).
- Si el job falla:
  - Revisar `error_message`/`error_code` en el job.
  - Logs del worker (busca `report_job.failed`).
- Si la descarga da 409:
  - El job aún no está en `SUCCEEDED` o no tiene `output_relpath`.

---

## 7) Punto crítico: `/media` en contenedores (evitar `FileNotFoundError`)

Síntoma típico en `backend_worker`:

```text
FileNotFoundError: [Errno 2] No such file or directory: '/media/institutions/letterheads/...'
```

Contexto real observado:
- Django usa `MEDIA_ROOT=/app/media`.
- Durante render PDF (WeasyPrint), algunos recursos pueden terminar resolviéndose como ruta absoluta `/media/...`.
- Si `/media` no está montado dentro del contenedor (`backend_worker`), el archivo existe en `/app/media` pero falla al abrir `/media/...`.

### Configuración obligatoria de volúmenes (dev y prod)

En `docker-compose.yml` deben estar estos mounts:

- `backend`:
  - `./backend:/app`
  - `./backend/media:/media`
- `backend_worker`:
  - `./backend:/app`
  - `./backend/media:/media`
- `backend_scheduler`:
  - `./backend:/app`
  - `./backend/media:/media`

Recomendado también en `backend_beat` para consistencia operativa.

Nota para producción:
- `docker-compose.prod.yml` es un override. Si no redefine `volumes`, hereda los de `docker-compose.yml`.
- Asegúrate de desplegar SIEMPRE ambos archivos (`-f docker-compose.yml -f docker-compose.prod.yml`).

### Aplicación de cambios en deploy

```bash
docker compose up -d --force-recreate backend backend_worker backend_scheduler backend_beat
```

### Verificación post-deploy (obligatoria)

1. Confirmar visibilidad de archivos en `/media` dentro del worker:

```bash
docker compose exec -T backend_worker sh -lc 'ls -l /media/institutions/letterheads | head'
```

2. Confirmar ausencia de errores recientes de jobs PDF:

```bash
docker compose logs --since 10m backend_worker | grep -Ei 'FileNotFoundError|No such file or directory|report_job.failed' || true
```

3. Smoke test rápido de WeasyPrint con una imagen de `/media`:

```bash
docker compose exec -T backend_worker python manage.py shell -c "from reports.weasyprint_utils import render_pdf_bytes_from_html; html='<html><body><img src=\"/media/institutions/letterheads/memebreteineplavi.png\"/></body></html>'; pdf=render_pdf_bytes_from_html(html=html, base_url='/app'); print('pdf_ok=', isinstance(pdf,(bytes,bytearray)), 'size=', len(pdf))"
```

### Operación después de corregir el mount

- Si hay jobs en `FAILED` por este incidente, reintentar generación con un job nuevo.
- No uses jobs viejos para validar fix: pueden contener estados previos (`FAILED`) que no cambian.
