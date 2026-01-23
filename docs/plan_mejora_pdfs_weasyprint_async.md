# Plan de mejora: generación de PDFs (WeasyPrint + Async + Storage privado)

Fecha: 2026-01-17

## Objetivo
Estandarizar y profesionalizar la generación de PDFs en Kampus (Django + React) para que:
- Se genere **en backend** (no en el navegador).
- Se ejecute **asíncrono** para no bloquear requests.
- Se almacene en **storage privado fuera de `MEDIA`** (sin URLs públicas).
- Mantenga **permisos**, **auditoría**, **expiración** y **observabilidad**.

## Estado actual (resumen)
- La plataforma “Gold Standard” ya está implementada: **WeasyPrint + ReportJob + Celery/Redis + storage privado**.
- La generación de PDFs puede ejecutarse **async** (recomendado) y también existe compatibilidad **sync** (con headers de deprecación).
- **WeasyPrint renderiza realmente** (no es solo prueba de import) y el stack compila en Docker.
- Infra activa en `docker-compose.yml`: `redis`, `backend_worker` (Celery) y `backend_scheduler`.
- PDFs sensibles se almacenan fuera de `MEDIA` (storage privado). En dev, `/media/...` puede seguir expuesto por conveniencia, pero **no se usa para PDFs sensibles**.

## Estado de implementación (actualizado)

Fecha de actualización: 2026-01-17

### Progreso aproximado
- Sprint 1: **100%** (completo)
- Sprint 2: **100%** (completo; se migraron 2 reportes en vez de 1)
- Sprint 3: **100%** (completo)
- Sprint 4: **100%** (completo)

### Funcionalidad ya implementada
- ✅ Infra: `redis` + `backend_worker` (Celery) + volumen privado `/data/kampus_private`.
- ✅ Storage privado: guardado fuera de `MEDIA` y descarga autenticada.
- ✅ Jobs: `ReportJob` + endpoints `/api/reports/jobs/` + `download`.
- ✅ Render estándar: WeasyPrint en worker (async) y en endpoints sync (compatibilidad).
- ✅ Se eliminó la dependencia `xhtml2pdf/pisa` del backend.
- ✅ Reportes reales migrados a jobs (WeasyPrint):
  - ✅ Boletín por estudiante (matrícula/periodo): `ACADEMIC_PERIOD_ENROLLMENT`
  - ✅ Boletín por grupo (grupo/periodo): `ACADEMIC_PERIOD_GROUP`
  - ✅ Acta de caso disciplinario: `DISCIPLINE_CASE_ACTA`
  - ✅ Planilla de asistencia (manual): `ATTENDANCE_MANUAL_SHEET`
  - ✅ Reporte de matriculados (PDF): `ENROLLMENT_LIST`
  - ✅ Planilla de calificaciones (en blanco): `GRADE_REPORT_SHEET`
  - ✅ Certificado de estudios: `CERTIFICATE_STUDIES`
  - ✅ Informe IA (docente): `TEACHER_STATISTICS_AI`
- ✅ Compatibilidad legacy: endpoints existentes soportan `?async=1`.
- ✅ Deprecación soft de PDFs síncronos migrados: headers `Deprecation`/`Sunset`/`Link`.
- ✅ UI React: generar → polling → descargar (grupo y estudiante) en pantalla de reportes.
- ✅ UI React: reporte de matriculados (PDF) migra a jobs.
- ✅ UI React: certificados (crear job → polling → descargar).
- ✅ Operación básica:
  - ✅ `cancel` de job (`POST /api/reports/jobs/{id}/cancel/`)
  - ✅ `expires_at` + TTL configurable
  - ✅ `cleanup_report_jobs` + ejecución periódica en scheduler
- ✅ Endurecimiento:
  - ✅ límites básicos (jobs activos y creación por hora)
  - ✅ logs de generación (duración/size/estado)
- ✅ Auditoría: `ReportJobEvent` (eventos por job)

## Decisión de arquitectura (Gold Standard)
- Render de plantillas HTML en Django → conversión HTML→PDF con **WeasyPrint**.
- Encolado asíncrono con **Celery + Redis**.
- Persistencia del resultado en **storage privado** fuera de `MEDIA` (sin `MEDIA_URL`).
- Descarga solo por endpoint autenticado (DRF) con `FileResponse`.

## Principios y requisitos
- **No bloquear** el request de API al generar PDFs.
- **Idempotencia** y reintentos (retries con backoff para fallos transitorios).
- **Permisos estrictos**: solo el usuario autorizado puede generar/descargar.
- **No exponer paths** ni links públicos.
- **Expiración y limpieza** de jobs/archivos.
- **Migración incremental**: mantener endpoints actuales mientras migramos.

---

## Propuesta técnica

### A) Storage privado fuera de `MEDIA`
- Ruta sugerida en contenedor: `/data/kampus_private`
- Env vars:
  - `KAMPUS_PRIVATE_STORAGE_ROOT=/data/kampus_private`
  - `KAMPUS_PRIVATE_REPORTS_DIR=reports`
- Docker:
  - Volumen nombrado recomendado (Windows-friendly): `kampus_private_data:/data/kampus_private`

Regla: **ningún PDF sensible** debe guardarse en `MEDIA_ROOT`.

### B) Sistema unificado de jobs: `ReportJob`
Modelo mínimo sugerido:
- `id` (UUID o int)
- `created_by` (FK user)
- `report_type` (choices)
- `params` (JSON)
- `status` (`PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED`)
- `progress` (0..100 opcional)
- `created_at`, `started_at`, `finished_at`
- `expires_at`
- `output_relpath` (ruta relativa bajo `KAMPUS_PRIVATE_STORAGE_ROOT`)
- `output_filename`, `output_content_type`, `output_size_bytes`
- `error_code`, `error_message`, `traceback` (solo admin)

### C) Endpoints DRF (contrato)
- `POST /api/reports/jobs/`
  - Input: `{ report_type, params }`
  - Output 202: `{ id, status, created_at, poll_url, download_url?: null }`
- `GET /api/reports/jobs/{id}/`
  - Output: `{ id, status, progress, error?, download_url? }`
- `GET /api/reports/jobs/{id}/download/`
  - Stream del PDF solo si `SUCCEEDED` y permisos OK
- (Opcional) `POST /api/reports/jobs/{id}/cancel/`

### D) Worker asíncrono (Celery + Redis)
- Redis como broker
- Celery worker para ejecutar `generate_report_job_pdf(job_id)`
- Timeouts / límites:
  - `soft_time_limit` y `time_limit`
  - `max_retries` con backoff
  - `rate_limit` si fuese necesario

### E) Migración incremental
Para cada reporte existente (hoy síncrono):
1. Extraer “render HTML” a función reutilizable.
2. Implementar `report_type` equivalente.
3. Endpoint actual recibe `?async=1` o se crea endpoint nuevo.
4. Frontend migra a flujo de job.
5. Cuando todos migren, deprecar endpoints síncronos.

---

## Backlog por Sprints (2 semanas por sprint)

> Nota: Los sprints incluyen entregables verificables (DoD) y criterios de aceptación.

### Sprint 0 — Preparación y decisiones (1–3 días)
**Objetivo:** reducir incertidumbre y dejar listo el terreno.
- Inventario final de reportes PDF: por módulo y prioridad (boletines, actas, certificados, planillas).
- Definir esquema de `report_type` y `params` por reporte (contrato estable).
- Definir políticas de permisos por `report_type`.
- Documento de estándares de HTML/CSS para PDFs (layout base, fuentes, paginación).

**Entregables**
- Lista priorizada de reportes a migrar.
- Contrato v1 de API de jobs.

**Criterio de aceptación**
- Aprobación del contrato y prioridades por el equipo.

---

### Sprint 1 — Infra + Storage privado + Jobs base
**Objetivo:** tener la plataforma lista (sin migrar aún todos los PDFs).

**Backend**
- ✅ Agregar dependencias de sistema para WeasyPrint en `backend/Dockerfile` (Pango, Cairo, GDK-Pixbuf, etc.).
- ✅ Agregar `weasyprint` en `backend/requirements.txt`.
- ✅ Mejorar `backend/test_weasyprint.py` para render real (genera un PDF mínimo y valida tamaño > 0).
- ✅ Implementar `PRIVATE_STORAGE_ROOT` y helpers seguros (anti path traversal).
- ✅ Crear modelo `ReportJob` + admin.
- ✅ Crear endpoints DRF base (`POST job`, `GET job`, `download`).

**Infra**
- ✅ Agregar servicios en `docker-compose.yml`:
  - ✅ `redis`
  - ✅ `backend_worker` (Celery)
  - ✅ volumen `kampus_private_data`
- ✅ Config Celery en Django (`CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` opcional).

**Entregables**
- ✅ Jobs funcionando end-to-end con un PDF “dummy” (plantilla mínima).
- ✅ Descarga autenticada desde storage privado.

**Criterio de aceptación**
- Crear job → cambia a SUCCEEDED → descarga PDF válido.
- No hay archivo bajo `/media/` para este flujo.

---

### Sprint 2 — Migración 1 (PDF crítico) + UI React
**Objetivo:** migrar el primer reporte real de alto impacto y validar el flujo completo.

**Selección recomendada (1 reporte):**
- Boletín por grupo **o** acta de convivencia **o** planilla de calificaciones (elige 1 para reducir riesgo).

**Backend**
- ✅ Implementar `report_type` real y su render HTML.
- ✅ Implementar tarea Celery para generar PDF con WeasyPrint.
- ✅ Mantener endpoint legacy con modo async (`?async=1`) para compatibilidad.

**Nota (alcance real):** se migraron 2 reportes prioritarios:
- ✅ Boletín por estudiante (matrícula/periodo): `ACADEMIC_PERIOD_ENROLLMENT`
- ✅ Boletín por grupo (grupo/periodo): `ACADEMIC_PERIOD_GROUP`

**Frontend**
- ✅ Crear cliente `reportsApi`:
  - ✅ `createJob`, `getJob`, `downloadJob`
- ✅ Implementar UI:
  - ✅ Botón “Generar PDF” → crea job
  - ✅ Polling con backoff hasta `SUCCEEDED|FAILED`
  - ✅ Descargar

**Entregables**
- 1 reporte real migrado y consumido desde React vía jobs.

**Criterio de aceptación**
- Bajo carga moderada, no hay timeouts del API.
- Permisos correctos: un usuario sin permiso no descarga.

---

### Sprint 3 — Migración 2–3 reportes + estandarización de plantillas
**Objetivo:** acelerar migración y unificar estética.

**Backend**
- ✅ Migrar 2–3 reportes adicionales.
- ✅ Introducir “template base” para PDFs (header/footer, numeración, estilos comunes).
- ✅ Agregar auditoría: log de eventos por job (`ReportJobEvent`).

**Frontend**
- ✅ Reusar el flujo estándar de “estado de generación” (toast + panel en pantalla de reportes).

**Entregables**
- 3–4 reportes totales migrados.

**Criterio de aceptación**
- PDFs consistentes en estilo.
- Jobs fallidos muestran mensaje útil (sin filtrar stacktrace a usuarios).

---

### Sprint 4 — Endurecimiento, limpieza y deprecación
**Objetivo:** robustez operativa y cierre de deuda técnica.

- Implementar expiración + limpieza:
  - Command o tarea periódica que elimina jobs expirados + archivos.
- ✅ Implementar expiración + limpieza:
  - ✅ Command `cleanup_report_jobs` + tarea periódica (scheduler)
  - ✅ `expires_at` + TTL configurable
- ✅ Cancelación de jobs: `POST /api/reports/jobs/{id}/cancel/`
- ✅ Rate-limits / límites por usuario (jobs activos y creación por hora).
- ✅ Métricas y observabilidad:
  - logs incluyen duración, estado, tamaño de salida.
- ✅ Deprecar endpoints síncronos para reportes migrados (soft deprecation via headers).
- ⏳ Evaluar remover exposición de `/media/` en entornos que no sean local (o restringirlo por auth).

**Entregables**
- Mantenimiento operativo completo.

**Criterio de aceptación**
- Jobs antiguos se limpian automáticamente.
- No hay PDFs sensibles en `MEDIA`.

---

## Priorización sugerida (impacto/criticidad)
1. Boletines académicos (grupo/estudiante)
2. Actas disciplinarias
3. Certificados (si son sensibles y deben dejar `MEDIA`)
4. Planillas (asistencia / calificaciones)
5. Reportes secundarios

## Riesgos y mitigaciones
- Dependencias nativas de WeasyPrint en Docker: mitigar con Dockerfile completo + test real.
- CSS/Paged media: mitigar con template base y pruebas por navegador/impresión.
- Permisos: mitigar replicando reglas existentes + tests de permisos.
- Migración gradual: mitigar con `?async=1` y toggles por feature flag.

## Definición de Hecho (DoD)
- Tests de backend para:
  - creación job
  - ejecución Celery
  - descarga auth
  - path traversal bloqueado
- Documentación mínima (README dev) para correr: `docker compose up --build` con redis/worker.
- No se expone el archivo por URL pública.

---

## Próximo paso (para empezar a implementar ya)
1) Alinear fecha de `Sunset`/deprecación final y definir cuándo se removerán los modos sync (o se dejarán solo para admins).
2) Endurecer `/media/` fuera de local (deshabilitarlo o autenticarlo), manteniendo assets públicos necesarios.
3) Opcional: unificar aún más estilos (base CSS) y validar visualmente PDFs “oficiales” (IA/certificados/actas).
