# Guía estandarizada de notificaciones por correo (Kampus)

## Objetivo
Definir el estándar único de envío de correos del proyecto (transaccionales y marketing), incluyendo configuración, plantillas, seguridad, trazabilidad, pruebas y operación.

## Arquitectura oficial (fuente de verdad)

### Capa de envío
- Servicio central: `backend/communications/email_service.py`
- Función oficial de envío: `send_email(...)`
- Todo envío debe pasar por esta función para garantizar:
  - Registro en `EmailDelivery`
  - Idempotencia por `idempotency_key`
  - Reglas de supresión (`EmailSuppression`)
  - Validación marketing opt-in
  - Encabezados `List-Unsubscribe` en marketing
  - Pie legal automático (texto + HTML)

### Capa de plantillas
- Servicio de plantillas: `backend/communications/template_service.py`
- Funciones oficiales:
  - `render_email_template(slug, context)`
  - `send_templated_email(slug, recipient_email, context, ...)`
- Modelo de plantillas: `EmailTemplate` (BD, editable por admin)
- Incluye:
  - Base HTML institucional
  - Logo de la institución (`Institution.logo`)
  - Enlace de respaldo automático si existe URL principal (`reset_url`, `cta_url`, `*_url`)

### Configuración runtime de correo
- Resolución efectiva: `backend/communications/runtime_settings.py`
- Orden de prioridad:
  1. `MailgunSettings` en base de datos (por entorno)
  2. Variables de entorno (`.env`) como fallback
- Entornos soportados: `development`, `production`

## Modelos clave

En `backend/communications/models.py`:
- `EmailDelivery`: trazabilidad completa de intentos/envíos
- `EmailSuppression`: rebotes, quejas, unsubscribed, etc.
- `EmailEvent`: eventos de webhook Mailgun
- `EmailPreference`: opt-in de marketing por destinatario
- `MailgunSettings`: configuración de backend correo por entorno
- `MailgunSettingsAudit`: auditoría de cambios de configuración
- `EmailTemplate`: plantillas editables (subject/text/html/variables)

## Endpoints estándar (API)

Rutas en `backend/communications/urls.py`:

### Configuración Mailgun
- `GET/PUT /api/communications/settings/mailgun/?environment=development|production`
- `POST /api/communications/settings/mailgun/test/?environment=...`
- `GET /api/communications/settings/mailgun/audits/?environment=...`
- `GET /api/communications/settings/mailgun/audits/export/?environment=...`

### Plantillas de correo
- `GET /api/communications/settings/email-templates/`
- `GET/PUT /api/communications/settings/email-templates/<slug>/`
- `POST /api/communications/settings/email-templates/<slug>/preview/`
- `POST /api/communications/settings/email-templates/<slug>/test/`

### Webhooks / preferencias
- `POST /api/communications/webhooks/mailgun/`
- `GET/PUT /api/communications/preferences/me/`
- `GET /api/communications/unsubscribe/one-click/?token=...`

## Plantillas base incluidas

Slugs iniciales:
- `password-reset`
- `mail-settings-test`
- `marketing-campaign-generic`
- `marketing-monthly-newsletter`
- `marketing-urgent-announcement`

> Regla: estas plantillas pueden personalizarse desde Sistema → Plantillas sin tocar código.

## Integraciones actuales en el proyecto

### Recuperación de contraseña
- Implementación en `backend/kampus_backend/auth_views.py`
- Usa `send_templated_email(slug="password-reset", ...)`
- Cada solicitud invalida tokens anteriores del usuario (comportamiento de seguridad esperado)

### Prueba de configuración correo
- Implementación en `MailSettingsTestView` (`communications/views.py`)
- Usa `send_templated_email(slug="mail-settings-test", ...)`

## Estándar de contenido y cumplimiento

### Pie legal obligatorio
Se agrega automáticamente en todos los correos (texto y HTML) desde `send_email`.

### Enlace de respaldo obligatorio
Cuando una plantilla use botón/enlace principal, el sistema debe mostrar además URL textual de respaldo dentro del cuerpo HTML.

### Marketing
- Requiere `marketing_opt_in=true`
- Respeta supresiones
- Agrega `List-Unsubscribe` + endpoint one-click

## Estándar de implementación (reglas para desarrolladores)

1. **No enviar correos directamente con `EmailMultiAlternatives` en vistas.**
2. Para correos con diseño, usar siempre `send_templated_email(...)`.
3. Para casos especiales sin plantilla, usar `send_email(...)` (mantiene políticas y trazabilidad).
4. Definir `category` coherente (`password-reset`, `transactional`, `marketing-*`, etc.).
5. Usar `idempotency_key` en eventos que puedan repetirse.
6. Evitar hardcode de configuración Mailgun en código de negocio.

## Flujo operativo recomendado (admin)

1. Configurar entorno en Sistema → Mailgun.
2. Validar envío con “Enviar prueba”.
3. Ajustar plantilla en Sistema → Plantillas.
4. Ejecutar preview con `context` JSON.
5. Enviar prueba de plantilla a correo controlado.
6. Monitorear `EmailDelivery` y eventos webhook.

## Troubleshooting estándar

### Error: token inválido o expirado (password reset)
- Verificar que sea el enlace más reciente.
- Confirmar que no se haya generado una nueva solicitud después.
- Revisar `PasswordResetToken.used_at` y `expires_at`.

### Estado `FAILED` en `EmailDelivery`
- Revisar `error_message` del registro.
- Confirmar dominio/sandbox Mailgun y destinatario autorizado.
- Verificar `MailgunSettings` para entorno correcto.

### No aplica configuración `.env`
- Si existe `MailgunSettings` en BD para el entorno, esa configuración prevalece.

## Pruebas y validación

Comandos base (backend Docker):
- `docker compose exec -T backend python manage.py test communications.tests --noinput`
- `docker compose exec -T backend python manage.py test users.tests_cookie_auth --noinput`
- `docker compose exec -T backend python manage.py test communications.tests users.tests_cookie_auth --noinput`

## Frontend (operación)

Pantalla de administración:
- `kampus_frontend/src/pages/SystemSettings.tsx`
- Componente de plantillas:
  - `kampus_frontend/src/components/system/EmailTemplateSettingsCard.tsx`
- Cliente API:
  - `kampus_frontend/src/services/system.ts`

## Checklist de estándar (DoD)

- [ ] Configuración Mailgun por entorno activa y validada
- [ ] Plantilla correspondiente creada/actualizada en BD
- [ ] Preview correcto con contexto real
- [ ] Prueba de envío exitosa
- [ ] Registro en `EmailDelivery` con `SENT` y/o trazabilidad de error
- [ ] Pie legal visible en texto y HTML
- [ ] Enlace de respaldo visible cuando hay CTA
- [ ] Reglas de marketing/supresión funcionando

---

Documento vigente para operación y desarrollo del módulo de notificaciones por correo en Kampus.
