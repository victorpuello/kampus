# Guía para desarrolladores: verificación pública por QR (Kampus)

Fecha: 2026-01-25

Este documento explica **cómo está implementada** la verificación por QR en Kampus y cómo **reutilizar/extender** la funcionalidad para nuevos documentos.

> Para operación en producción (variables de entorno, proxy, smoke tests), ver también: `docs/runbook_verificacion_qr.md`.

---

## 1) Qué resuelve el sistema

- Emitir documentos (PDF/HTML) con un **QR** que apunta a una URL pública.
- Permitir que cualquier persona valide autenticidad sin iniciar sesión.
- Ser **deploy-safe** (funcionar detrás de reverse proxy y en jobs asíncronos).
- Ser **robusto** ante errores típicos al copiar/pegar URLs desde PDF (espacios, saltos de línea).
- Mantener **privacidad**: el backend expone solo un `public_payload` controlado.

---

## 2) Conceptos / componentes

### 2.1. `VerifiableDocument`

Entidad central que representa “algo verificable públicamente”.

Ubicación:
- `backend/verification/models.py`

Características:
- `token` opaco y no predecible (se usa en la URL del QR).
- `doc_type` identifica el tipo (ej. `STUDY_CERTIFICATE`, `STUDY_CERTIFICATION`, `REPORT_CARD`).
- `status` (`ACTIVE`, `REVOKED`, `EXPIRED`).
- `public_payload` (JSON) con un snapshot mínimo para mostrar en verificación.
- Referencia al objeto origen (p.ej. `object_type="CertificateIssue"`, `object_id=<uuid>` o `ReportJob`).

### 2.2. Política de exposición pública (`public_payload`)

Ubicación:
- `backend/verification/payload_policy.py`

Responsabilidades:
- **Whitelist por `doc_type`**: descarta cualquier llave no permitida.
- **Enmascarar `document_number`** (solo últimos 4).
- Sanitización especial para listas (`rows`) por tipo de documento.

Esto es la “última línea de defensa” para evitar filtración accidental de datos sensibles.

### 2.3. Servicios para crear/reusar tokens

Ubicación:
- `backend/verification/services.py`

Funciones clave:
- `get_or_create_for_certificate_issue(...)` para certificados (`CertificateIssue`).
- `get_or_create_for_report_job(...)` para documentos generados vía `ReportJob`.
- `build_public_verify_url(token)` genera la URL absoluta (si existe `KAMPUS_PUBLIC_SITE_URL`).

### 2.4. Endpoints públicos

Ubicación:
- `backend/verification/views_public.py`
- URLs:
  - `backend/verification/public_urls.py` (API)
  - `backend/verification/public_site_urls.py` (UI)

Rutas canónicas:
- API (recomendado para el QR):
  - `GET /api/public/verify/<token>/`
  - Si `Accept: text/html` → responde **HTML** (útil al escanear un QR)
  - Si no → responde **JSON**
- UI:
  - `GET /public/verify/<token>/`

La razón de recomendar `/api/public/verify/<token>/` como QR es que muchas arquitecturas solo enrutan `/api/` al backend.

### 2.5. UI pública (HTML)

Template:
- `backend/verification/templates/verification/public/verify.html`

Incluye:
- Estado (VÁLIDO/REVOCADO/EXPIRADO/NO ENCONTRADO)
- Resumen del documento (del `public_payload`)
- Link “Ver JSON”

### 2.6. Robustez contra URLs “ensuciadas”

Se cubren dos casos comunes:

1) Espacios insertados en la ruta (por copiar de PDF):
- Ejemplo: `/api/%20%20public/verify/<token>/`
- Solución: middleware que normaliza y redirige.

Ubicación:
- `backend/verification/middleware.py`

2) Token con whitespace/saltos de línea:
- Solución: `strip()` del token en la vista pública y redirect a URL canónica.

Ubicación:
- `backend/verification/views_public.py`

### 2.7. Hardening (rate limit + auditoría)

- Throttle público (evita abuso/enumeración)
  - `backend/verification/throttles.py`
- Auditoría de accesos
  - `backend/verification/models.py` (modelo `VerificationEvent`)

---

## 3) Flujo extremo-a-extremo

### 3.1. Certificado de estudios (emitido desde `CertificateIssue`)

1) Se crea un `CertificateIssue` con su `payload`.
2) Se crea/reusa un `VerifiableDocument` para ese `CertificateIssue`.
3) Se arma `verify_url` con el token.
4) El PDF incluye:
   - QR (imagen)
   - link “Abrir enlace”
   - el `token` mostrado como “Código” (para evitar copy/paste corrupto)

Ubicación típica:
- Emisión: `backend/students/views.py`
- PDF: `backend/students/templates/students/reports/certificate_studies_pdf.html`

### 3.2. Certificación académica (PDF vía `ReportJob`)

1) El frontend crea `ReportJob` con `report_type: STUDY_CERTIFICATION`.
2) El backend, al renderizar el HTML del reporte, crea/reusa un `VerifiableDocument` asociado al `ReportJob`.
3) El HTML/PDF incluye el QR y el texto de verificación.

Ubicación típica:
- Render job: `backend/reports/tasks.py`
- Template: `backend/students/templates/students/reports/study_certification_pdf.html`

### 3.3. Boletines (`ReportJob`)

Similar a certificación académica, usando `doc_type=REPORT_CARD`.

Notas importantes:
- El `public_payload` de `REPORT_CARD` puede incluir `rows` y `final_status`, pero se **sanitiza** y se limita.

---

## 4) Cómo agregar QR a un nuevo documento

Checklist mínimo:

1) **Definir qué es el documento**
- ¿Sale desde `CertificateIssue`?
- ¿Sale desde `ReportJob`?
- ¿Otro flujo (vista directa)?

2) **Crear/reusar un `VerifiableDocument`**
- Si es `CertificateIssue`: usar `get_or_create_for_certificate_issue`.
- Si es `ReportJob`: usar `get_or_create_for_report_job`.

3) **Definir el `doc_type`**
- Si necesitas un nuevo tipo, agrégalo al enum de `VerifiableDocument.DocType`.

4) **Definir `public_payload`**
- Mantenerlo mínimo.
- Incluir lo necesario para comparar contra el papel.
- Evitar PII sensible.

5) **Actualizar `payload_policy.py`**
- Agregar llaves permitidas a `_ALLOWED_PUBLIC_PAYLOAD_KEYS[doc_type]`.
- Si incluyes listas (p.ej. `rows`), sanitizarlas con whitelist y límites.

6) **Agregar QR al template PDF/HTML**
- Preferir QR como `data:image/png;base64,...` (funciona en PDF y web).
- Mostrar:
  - “Abrir enlace”
  - “Código: <token>”
  - URL en monoespaciado sin cortes (evitar copy/paste corrupto)

7) **Pruebas**
- Agregar tests en `backend/verification/tests.py`:
  - Respuesta JSON
  - Respuesta HTML
  - Sanitización del payload (no fuga de campos extra)

---

## 5) Integración en el frontend (SPA)

### 5.1. Impresiones “en navegador”

Para impresiones en el SPA, la forma más estable es usar el HTML preview del backend (que ya incluye QR y estilos de PDF).

Ejemplo implementado:
- `kampus_frontend/src/pages/StudentStudyCertificationPrint.tsx`

Estrategia:
- Crear (o reutilizar) un `ReportJob`.
- Cargar `GET /api/reports/jobs/<id>/preview/` (HTML).
- Renderizarlo en un `iframe` con `srcDoc`.
- Inyectar `<base href="VITE_API_BASE_URL">` para que carguen imágenes.
- Envolver el contenido en una “hoja A4” (márgenes por padding) para que los navegadores se vean bien.

---

## 6) Backfill (documentos históricos)

Si existen documentos emitidos antes de esta funcionalidad, se puede crear `VerifiableDocument` para históricos:

- Comando:
  - `python backend/manage.py backfill_verifiable_documents --apply`

Ubicación:
- `backend/verification/management/commands/backfill_verifiable_documents.py`

---

## 7) Troubleshooting

### “Documento no encontrado” pero lo acabo de generar

Causas comunes:
- Estás copiando el URL desde el texto del PDF y el token quedó con un carácter perdido/movido.
  - Solución: usar el QR, o copiar el “Código” (token) cuando el PDF lo muestre separado.

### El QR abre `/api/%20%20public/verify/...`

Causa:
- Espacios insertados al copiar/pegar.

Solución:
- Middleware de normalización redirige a `/api/public/verify/...`.

### Imágenes del membrete/firma no cargan en vista imprimible del SPA

Causa:
- `iframe srcDoc` no tiene base URL y rompe rutas relativas.

Solución:
- Inyectar `<base href="...">` apuntando al backend.

---

## 8) Referencias rápidas

- Modelo: `backend/verification/models.py`
- API/UI: `backend/verification/views_public.py`
- URLs: `backend/verification/public_urls.py`, `backend/verification/public_site_urls.py`
- Sanitización: `backend/verification/payload_policy.py`
- Servicios: `backend/verification/services.py`
- Middleware: `backend/verification/middleware.py`
- UI template: `backend/verification/templates/verification/public/verify.html`
- Tests: `backend/verification/tests.py`

---

## 9) Nota de privacidad

Antes de exponer nuevos campos en `public_payload`:

- Pregúntate si el dato es estrictamente necesario para validar autenticidad.
- Prefiere enmascarar identificadores.
- Para notas/boletines, evita exponer detalles sensibles si no es imprescindible.
- Agrega un test que demuestre que campos no permitidos **no se filtran**.
