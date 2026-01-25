# Runbook (producción): verificación pública por QR

Este runbook deja la verificación por QR funcionando de forma **deploy-safe**, incluso detrás de reverse proxy.

## Rutas públicas (mínimo)

El QR recomendado puede apuntar a:

- `GET /api/public/verify/<token>/`
  - Si el cliente envía `Accept: text/html`, responde **HTML** (ideal para escaneo QR).
  - Si no, responde **JSON**.

Opcionalmente también existe:

- `GET /public/verify/<token>/` (UI)

Nota: si tu arquitectura sirve `/public/` desde el frontend SPA, **no dependas** de `/public/verify/` para el QR. Usa `/api/public/verify/<token>/`.

## Variables de entorno

Backend (Django):

- `KAMPUS_PUBLIC_SITE_URL` (recomendado en producción)
  - Ejemplo: `https://colegio.midominio.com`
  - Se usa para generar URLs absolutas en procesos asíncronos (ReportJobs/Celery) y evitar hosts internos.
- `KAMPUS_PUBLIC_VERIFY_THROTTLE_RATE`
  - Ejemplo: `60/min`, `100/hour`
  - Controla rate limit del endpoint público.

Reverse proxy / Django:

- `DJANGO_SECURE_PROXY_SSL_HEADER=true` (si TLS termina en el proxy)
- `DJANGO_USE_X_FORWARDED_HOST=true`
- `DJANGO_ALLOWED_HOSTS=colegio.midominio.com`

## Reverse proxy: requisitos

Asegura que el proxy enrute **al backend**:

- `/api/` → backend (Django)

Opcional:

- `/public/verify/` → backend (Django)

Headers recomendados:

- `Host`
- `X-Forwarded-Proto: https`
- `X-Forwarded-For`

## Smoke tests

Reemplaza `<token>` por un token real (desde un PDF emitido o desde la BD).

- HTML (simula escaneo QR):
  - `curl -i -H "Accept: text/html" https://colegio.midominio.com/api/public/verify/<token>/`
- JSON:
  - `curl -i -H "Accept: application/json" https://colegio.midominio.com/api/public/verify/<token>/`

Resultados esperados:

- `200` cuando el token existe.
- `404` cuando el token no existe.
- `429` cuando se excede el rate limit.

## Backfill (opcional)

Para crear tokens de verificación para certificados históricos (CertificateIssue) que aún no tengan `VerifiableDocument`:

- Dry-run:
  - `python backend/manage.py backfill_verifiable_documents`
- Aplicar cambios:
  - `python backend/manage.py backfill_verifiable_documents --apply`

Recomendación: ejecutar primero dry-run en producción y validar el conteo.

## Privacidad (recomendación)

- `public_payload` debe ser **mínimo**.
- En el backend se aplica una **whitelist por `doc_type`** (se descartan llaves no permitidas) para evitar filtraciones accidentales.
- `document_number` se entrega **enmascarado** (solo últimos 4) en UI/JSON.
- Para boletines, evita exponer notas/campos sensibles públicamente.

Referencia de implementación:
- `backend/verification/payload_policy.py`
