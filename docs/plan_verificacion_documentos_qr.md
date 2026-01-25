# Plan de implementación: Verificación robusta de documentos con QR (multi-documento)

Fecha: 2026-01-25

## Estado actual (repo)

Implementado ya en el proyecto:

- **Base multi-documento**: app `verification` con modelo `VerifiableDocument` (token opaco, estados, `public_payload`, revocación/expiración).
- **Rutas canónicas**:
  - UI: `/public/verify/<token>/`
  - API: `/api/public/verify/<token>/` (si el cliente pide HTML con `Accept: text/html`, responde HTML; si no, responde JSON)
- **Deploy-safe URLs**: soporte de `KAMPUS_PUBLIC_SITE_URL` para generar URLs absolutas desde procesos sin request (Celery/ReportJobs).
- **Compatibilidad legacy**: se mantienen rutas legacy de certificados bajo `/public/certificates/<uuid>/...` y `/api/public/certificates/<uuid>/...`.
- **Integración QR en PDFs (nuevos emitidos)**:
  - Certificados de estudios emitidos desde `CertificateIssue`: se crea/reusa `VerifiableDocument` y se usa el token para construir `verify_url`.
  - Certificación académica (`ReportJob` tipo `STUDY_CERTIFICATION`): se crea/reusa `VerifiableDocument` y se inserta bloque QR en el template.
  - Boletines (`ReportJob` tipo `ACADEMIC_PERIOD_ENROLLMENT` y `ACADEMIC_PERIOD_GROUP`): se crea/reusa `VerifiableDocument` y se inserta bloque QR en los templates.

Nota importante:
- Para máxima resiliencia en producción, el QR puede apuntar a `/api/public/verify/<token>/` porque ese endpoint puede renderizar HTML. Esto evita depender de que el proxy enrute correctamente `/public/`.

## Objetivo
Construir un sistema **robusto, funcional y adaptable** para la verificación de documentos expedidos por Kampus mediante códigos QR, soportando **múltiples tipos de documentos** (certificados, constancias y boletines), sin romper la verificación de documentos ya emitidos.

El sistema debe:
- Funcionar consistentemente en **deploy** (dominio real, HTTPS, reverse proxy, rutas públicas).
- Ser **extensible** a nuevos documentos sin duplicar lógica.
- Ser **seguro** contra manipulación y enumeración (en la medida razonable para un sistema académico).
- Mantener **compatibilidad hacia atrás** con QRs existentes.

---

## Contexto / Problema actual (resumen)
Hoy existe un sistema de verificación pública asociado a “certificados” que en producción suele fallar por:
- El QR apuntando a rutas no expuestas por el proxy (ej: `/public/...`).
- URLs generadas con **host/scheme incorrecto** (http en lugar de https, host interno, localhost).
- Config de deploy incompleta: `ALLOWED_HOSTS`, `SECURE_PROXY_SSL_HEADER`, `X-Forwarded-Proto`, rutas de `media/`.

Además, el diseño actual está acoplado al concepto de “certificado” y no contempla de forma nativa constancias/boletines.

---

## Principios de diseño
1. **URL canónica estable**: una ruta pública genérica para verificación, independiente del tipo de documento.
2. **Compatibilidad**: conservar rutas legacy para QRs ya emitidos.
3. **Separación UI/API**:
   - UI pública (HTML) para usuarios finales.
   - API pública (JSON) para integraciones.
4. **DocType explícito**: el sistema debe saber qué tipo de documento está verificando.
5. **Mínima exposición de datos**: mostrar solo lo necesario para confirmar autenticidad.
6. **Observabilidad**: auditoría, métricas y alertas para fallas en verificación.

---

## Arquitectura objetivo (propuesta)

### 1) Entidad genérica: Documento Verificable
Crear una entidad central (p.ej. `VerifiableDocument`) que representa “algo que se puede verificar públicamente”.

Campos propuestos (mínimos):
- `id` (PK)
- `token` (string corto/medio, aleatorio; único; usado en la URL)
- `doc_type` (enum: CERTIFICATE, CONSTANCY, REPORT_CARD, etc.)
- `object_uuid` o (`content_type` + `object_id`) (referencia al documento emitido / snapshot)
- `issued_at`
- `expires_at` (opcional)
- `revoked_at` (opcional)
- `status` (ACTIVE/REVOKED/EXPIRED)
- `seal_hash` (hash informativo del contenido “congelado”)
- `public_payload` (JSON con snapshot mínimo para UI/API; permite verificar sin joins complejos)
- `created_by` / `issued_by` (opcional)

Notas:
- Para robustez, el `token` debe ser **opaco y no predecible** (recomendado: 128 bits base64url o hex largo).
- `public_payload` permite mostrar datos sin depender de estructuras internas cambiantes.

### 2) URL canónica
Agregar rutas canónicas (nuevas):
- UI: `/public/verify/<token>/`
- API: `/api/public/verify/<token>/`

Mantener rutas legacy existentes (ej: `/public/certificates/<uuid>/`) mediante:
- seguir sirviéndolas, o
- redirigir (302/301) hacia la canónica si hay mapping, sin romper el caso de UUID-only.

### 3) Resolver por tipo (registry)
Definir un “resolver” que, dado `doc_type`, produce:
- `public_payload` (o actualiza/valida el payload)
- datos para UI
- respuesta JSON

Esto evita duplicación: cada nuevo tipo se agrega como “plugin” (función/clase) y no como un sistema paralelo.

### 4) Inserción del QR en PDFs
Estandarizar un bloque reutilizable:
- `verify_url` (canónica)
- QR como data URI (PNG) embebida
- texto visible con la URL corta

Aplicar este bloque en:
- Certificados existentes (para nuevos emitidos)
- Constancias
- Boletines

---

## Estrategia de Token (decisión recomendada)

### Opción A (recomendada): Token opaco respaldado por DB
- **Pros**: revocación simple, rotación simple, auditoría clara, estabilidad incluso si cambia el formato.
- **Cons**: requiere tabla/consulta DB en verificación.

### Opción B: Token firmado (HMAC) “stateless”
- **Pros**: valida formato sin DB (parcial), robusto ante manipulación del token.
- **Cons**: revocación/rotación complicadas (lista negra o DB igual); más complejidad.

Recomendación:
- Implementar Opción A como base.
- Opcional: añadir firma HMAC dentro del token o como query param para elevar anti-tamper, manteniendo lookup en DB.

---

## Contrato de verificación (API pública)
Estado actual (implementado): la API pública devuelve un esquema simple y versionado con un `public_payload` flexible:

```json
{
  "version": 1,
  "valid": true,
  "token": "...",
  "doc_type": "STUDY_CERTIFICATE",
  "status": "ACTIVE",
  "issued_at": "2026-01-01T00:00:00Z",
  "expires_at": null,
  "revoked_at": null,
  "revoked_reason": "",
  "seal_hash": "...",
  "public_payload": {
    "title": "Certificado de estudios",
    "student_full_name": "...",
    "document_number": "****1234",
    "academic_year": "...",
    "grade_name": "..."
  }
}
```

Notas:
- `public_payload` debe ser **mínimo** y no incluir información sensible (por ejemplo, para boletines no incluir notas detalladas).
- En el repo, `public_payload` se **sanitiza por `doc_type`** (whitelist de llaves) y `document_number` se **enmascara** (solo últimos 4) para reducir exposición.
- `version` permite evolucionar; si se necesita un contrato más estricto (p.ej. `subject/issuer/summary`), se puede introducir como **v2** manteniendo v1.

---

## UI pública (HTML)
Recomendación:
- Página genérica `/public/verify/<token>/` con:
  - Estado grande: VÁLIDO / REVOCADO / EXPIRADO / NO ENCONTRADO
  - Resumen del documento
  - Datos mínimos del estudiante/institución
  - “Ver JSON” (link a API)

Para algunos tipos (boletines) mostrar solo:
- periodo/año, grado/grupo, institución, estudiante, fecha de emisión
- sin notas detalladas (depende de política de privacidad)

---

## Seguridad y robustez

### 1) Anti-enumeración
- Token aleatorio largo.
- Rate limiting por IP (DRF throttling para endpoints públicos).
- Respuestas uniformes: evitar filtrar detalles cuando no existe.

### 2) Revocación
- Revocar = mantener verificable pero marcado como inválido.
- UI debe mostrar “REVOCADO” con fecha/motivo (motivo opcional).

### 3) Expiración (opcional)
- Por defecto no expira.
- Para ciertos documentos, permitir expiración configurable.

### 4) Auditoría y alertas
- Log de accesos a verificación: éxito, no encontrado, inválido, revocado.
- Métricas (contador por resultado) y alertas si aumenta el % de fallos.

### 5) Consistencia en deploy (clave)
Checklist backend/proxy:
- Proxy debe enrutar:
  - `/api/` → backend
  - `/public/` → backend (al menos `/public/verify/`)
  - `/media/` → backend o servicio de estáticos
- Pasar headers correctos:
  - `Host`
  - `X-Forwarded-Proto: https`
- Settings Django:
  - `ALLOWED_HOSTS` correcto
  - `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` cuando TLS termina en proxy
  - `CSRF_TRUSTED_ORIGINS` si aplica
  - CORS solo si el SPA consumirá endpoints públicos (no imprescindible para UI server-rendered)

---

## Migración y compatibilidad
1. **No romper QRs antiguos**:
   - Mantener endpoints legacy.
2. Nuevos documentos:
   - Emitir QR apuntando a URL canónica `/public/verify/<token>/`.
3. (Opcional) Backfill:
   - Crear `VerifiableDocument` para certificados históricos y habilitar redirección desde legacy hacia canónica.

---

## Plan por sprints

### Sprint 0 — Diagnóstico y “hotfix” de deploy (1–2 días)
Objetivo: que la verificación actual funcione en producción **sin tocar aún el modelo multi-doc**.

Estado: **Completado** (ver `KAMPUS_PUBLIC_SITE_URL`, `DJANGO_USE_X_FORWARDED_HOST`, `DJANGO_SECURE_PROXY_SSL_HEADER`, y endpoints bajo `/api/public/verify/`).

Tareas:
- Documentar rutas públicas requeridas y validar reverse proxy (Nginx/Traefik) para `/public/` y `/api/public/...`.
- Verificar `ALLOWED_HOSTS`, `SECURE_PROXY_SSL_HEADER`, `X-Forwarded-Proto`.
- Añadir healthcheck de endpoint público `/api/public/...`.

Entregables:
- Checklist de deploy + ejemplo de config de proxy.
- Evidencia (curl/logs) de que la verificación responde 200/404 coherente en prod.

Criterio de aceptación:
- Escanear un QR existente abre una página válida (o JSON) en el dominio real.

---

### Sprint 1 — Base multi-documento: `VerifiableDocument` + endpoints canónicos (4–6 días)
Objetivo: introducir el núcleo genérico sin migrar todos los documentos todavía.

Estado: **Completado**.

Tareas:
- Crear modelo `VerifiableDocument`.
- Crear tokens aleatorios y únicos.
- Agregar endpoints canónicos:
  - UI: `/public/verify/<token>/`
  - API: `/api/public/verify/<token>/`
- Implementar plantilla UI genérica y serializer JSON versionado.
- Implementar auditoría/metrics base.

Entregables:
- Modelo + migración.
- Endpoints públicos canónicos.
- Tests unitarios de modelo + API.

Criterio de aceptación:
- Dado un `VerifiableDocument` activo, la UI y la API lo muestran correctamente.

---

### Sprint 2 — Integración Certificados (5–7 días)
Objetivo: que los certificados nuevos usen la verificación canónica.

Tareas:
- Al emitir un certificado, crear `VerifiableDocument` con `doc_type = STUDY_CERTIFICATE`.
- Actualizar el template PDF del certificado para:
  - usar `verify_url` canónica
  - mostrar QR embebido
- Mantener endpoint legacy funcionando.
- (Opcional) mapping legacy→canónico para redirect.

Entregables:
- Certificados nuevos con QR canónico.
- Tests de emisión: valida que el PDF incluya la URL canónica.

Criterio de aceptación:
- Un certificado emitido en prod se verifica escaneando el QR (UI) y también por API.

Estado: **Completado** para certificados emitidos desde `CertificateIssue`.

---

### Sprint 3 — Integración Constancias / Certificación Académica (5–7 días)
Objetivo: constancias/“certificación académica” con QR verificable.

Tareas:
- Definir doc_type (en el repo): `STUDY_CERTIFICATION`.
- En el pipeline de ReportJob (o emisión equivalente), crear `VerifiableDocument` (token) y pasar `verify_url` al template.
- Incluir bloque QR en el template de constancia.

Entregables:
- Constancia con QR canónico.
- Tests del ReportJob/WeasyPrint (skip si no hay WeasyPrint en CI).

Criterio de aceptación:
- Constancia emitida se verifica en UI/API.

Estado: **Completado** (QR + `verify_url` + token por `ReportJob`).

---

### Sprint 4 — Integración Boletines (7–10 días)
Objetivo: boletines verificables sin exponer información sensible.

Tareas:
- Identificar el “documento boletín” (snapshot / reporte) y definir doc_type `REPORT_CARD`.
- Definir qué muestra la verificación (mínimo): estudiante, institución, año/periodo, grado/grupo, fecha de emisión.
- Generar `VerifiableDocument` al crear el PDF del boletín.
- Insertar QR en template de boletín.

Entregables:
- Boletín con QR.
- UI/API muestra resumen seguro.

Criterio de aceptación:
- Boletín se verifica en prod con QR.

Estado: **Completado** para:
- Individual por matrícula/periodo (`ACADEMIC_PERIOD_ENROLLMENT`)
- Informe por grupo (`ACADEMIC_PERIOD_GROUP`)

---

### Sprint 5 — Hardening y confiabilidad (5–8 días)
Objetivo: reducir fallas en deploy y mejorar seguridad/operación.

Estado: **Completado**.

Tareas:
- Throttling/rate limit para endpoints públicos.
- Mejoras de auditoría y panel básico (admin) de eventos de verificación.
- (Opcional) firma HMAC complementaria.
- Herramientas de diagnóstico: endpoint de “echo headers” protegido para validar proxy.

Entregables:
- Config de throttling.
- Logs/metrics accionables.

Criterio de aceptación:
- Bajo pruebas de carga moderada, el endpoint mantiene latencia estable y no cae.

Notas del repo:
- Throttling implementado via `PublicVerifyRateThrottle` y setting `PUBLIC_VERIFY_THROTTLE_RATE`.
- Auditoría implementada con modelo `VerificationEvent` y admin.
- Se optimizó para no escribir en DB en cada GET (solo cuando cambia el `status`).

---

### Sprint 6 — Backfill + documentación + rollout (3–6 días)
Objetivo: cerrar el ciclo y dejar operación/documentación listas.

Estado: **Completado** (runbook + comando de backfill + política de payload público aplicada en backend).

Implementado en:
- `docs/runbook_verificacion_qr.md`
- `backend/verification/management/commands/backfill_verifiable_documents.py`
- `backend/verification/payload_policy.py` (whitelist + enmascarado)

Checklist Sprint 6 (para “100%”):
- Runbook de despliegue (reverse proxy) + variables necesarias y smoke tests.
- Política final de privacidad por `doc_type` (qué campos van en `public_payload`).
- Guía corta para agregar un nuevo `doc_type` (pasos y ejemplo).
- Decisión formal sobre legacy→canónico (mantener vs redirigir cuando haya mapping).
- (Opcional) comando de backfill para documentos históricos.

---

## Definición de “100% implementado” (recomendación)

Para considerar el sistema al 100% (robusto + operable en producción), debería cumplirse:

1) **Verificación funcional (UI/JSON) para todos los documentos objetivo**
- Certificados (CertificateIssue)
- Certificación académica (ReportJobs)
- Boletines (ReportJobs)

2) **Deploy correcto y repetible (runbook)**
- Proxy enruta `/api/public/verify/` (mínimo obligatorio) y opcionalmente `/public/verify/`.
- Variables/headers documentados: `KAMPUS_PUBLIC_SITE_URL`, `DJANGO_USE_X_FORWARDED_HOST`, `DJANGO_SECURE_PROXY_SSL_HEADER`, `DJANGO_ALLOWED_HOSTS`.

3) **Seguridad operativa básica**
- Throttling/rate limit en `/api/public/verify/<token>/` y `/public/verify/<token>/`.
- Respuestas coherentes para anti-enumeración (definir política: qué diferencia hay entre “no existe” vs “revocado/expirado”).

4) **Observabilidad mínima**
- Auditoría de accesos (éxito / no encontrado / revocado / expirado), con IP y user-agent.
- Métricas/contadores (aunque sea vía logs estructurados) para detectar picos de fallos.

5) **Compatibilidad y evolución**
- Mantener legacy (ya ok) y decidir si habrá redirección legacy→canónico cuando aplique.
- Guía corta para agregar nuevos `doc_type` + payload mínimo esperado.

Tareas:
- (Opcional) backfill de `VerifiableDocument` para documentos históricos.
- Documentación de despliegue y troubleshooting.
- Guía de agregar nuevos doc_types.

Entregables:
- Documentación final y runbook.

Criterio de aceptación:
- Cualquier equipo puede agregar un nuevo documento verificable siguiendo la guía.

---

## Further Considerations (para implementación completa)

### A) ¿Dónde vivirán “constancias” y “boletines” como entidades?
Opciones:
1) Crear modelos de emisión para cada tipo (similar a certificados) y referenciarlos desde `VerifiableDocument`.
2) Basarse en `ReportJob` como “emisión” y referenciar `ReportJob.id` + `report_type`.

Recomendación:
- Para boletines/constancias generadas por ReportJob, referenciar `ReportJob` (o snapshot) si ya es la fuente de verdad.
- Para certificados legales, mantener entidad propia (si ya existe) y referenciarla.

### B) Privacidad
Definir explícitamente qué campos se exponen por tipo. Para boletines, evitar exponer notas detalladas públicamente salvo que exista justificación/legalidad.

Estado en repo:
- Existe una whitelist por `doc_type` para `public_payload`.
- `document_number` se enmascara (solo últimos 4) en UI/JSON.

### C) Multi-institución / multi-sede
Si el sistema opera múltiples instituciones/sedes, incluir `institution_id` en `public_payload` y/o index.

### D) Resiliencia ante cambios de dominio
- Preferir usar un dominio estable para verificación (p.ej. `verify.midominio`).
- Evitar que el QR apunte a `localhost` mediante validación en backend (si detecta `DEBUG`/host inválido, bloquear emisión o registrar warning).

### E) Observabilidad
- Dashboard mínimo: conteo de verificaciones por día, por resultado, top IPs, documentos más consultados.

### F) Compatibilidad a largo plazo
- Mantener legacy de forma indefinida o al menos 2–5 años (dependiendo de normatividad).

---

## Checklist de pruebas (mínimo)
- Unit tests:
  - token único
  - estados ACTIVE/REVOKED/EXPIRED
  - serializer JSON v1
- API tests:
  - 200 para token válido
  - 404/410 para no encontrado / revocado
- PDF/template tests:
  - el HTML contiene `verify_url`
  - el QR se genera (si se testea; opcional)
- Deploy tests (smoke):
  - `curl -I https://dominio/public/verify/<token>/`
  - `curl -I https://dominio/api/public/verify/<token>/`

---

## Resultado esperado
Al finalizar:
- Todo documento nuevo (certificado/constancia/boletín) incluirá un QR que apunta a una URL canónica pública.
- La verificación funcionará en deploy por tener rutas y configuración claras.
- El sistema será extensible agregando doc_types y resolvers, sin duplicar verificación.
