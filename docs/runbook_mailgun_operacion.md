# Runbook Mailgun (Reset + Notificaciones + Marketing)

## Objetivo
Operar de forma segura el envío de correos en Kampus con Mailgun, incluyendo:
- correos transaccionales (reset de contraseña, notificaciones operativas),
- supresión automática por rebotes/quejas,
- consentimiento y baja one-click para marketing.

## Alcance técnico implementado
- Envío centralizado: `backend/communications/email_service.py`
- Trazabilidad de envíos: `communications.EmailDelivery`
- Webhooks Mailgun: `POST /api/communications/webhooks/mailgun/`
- Supresión: `communications.EmailSuppression`
- Eventos procesados: `communications.EmailEvent`
- Preferencias marketing: `communications.EmailPreference`, `communications.EmailPreferenceAudit`
- One-click unsubscribe: `GET|POST /api/communications/unsubscribe/one-click/?token=...`

## Variables requeridas
Definir en entorno backend:

```env
KAMPUS_EMAIL_BACKEND=mailgun
DEFAULT_FROM_EMAIL=no-reply@tu-dominio.com
MAILGUN_API_KEY=...
MAILGUN_SENDER_DOMAIN=mg.tu-dominio.com
MAILGUN_WEBHOOK_SIGNING_KEY=...
MAILGUN_WEBHOOK_STRICT=true
KAMPUS_BACKEND_BASE_URL=https://api.tu-dominio.com
KAMPUS_MARKETING_DEFAULT_OPT_IN=false
KAMPUS_MARKETING_UNSUBSCRIBE_TOKEN_TTL_SECONDS=2592000
KAMPUS_NOTIFICATIONS_EMAIL_ENABLED=true
```

## Checklist DNS (deliverability)
- SPF publicado para dominio remitente.
- DKIM publicado según selector entregado por Mailgun.
- DMARC publicado (`p=none` al inicio, luego endurecer por fases).
- Dominio remitente validado en Mailgun antes de producción.

## Flujo operativo por tipo de correo

### 1) Transaccional
- Categorías como `password-reset` y `in-app-notification`.
- Si existe supresión por `HARD_BOUNCE`, `COMPLAINT` o soft bounce >= 3, el envío se bloquea con estado `SUPPRESSED`.
- Si la supresión es `UNSUBSCRIBED`, **NO** bloquea transaccional.

### 2) Marketing
- Categorías que inician por `marketing`.
- Requiere `marketing_opt_in=true`.
- Inserta headers:
  - `List-Unsubscribe`
  - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- `UNSUBSCRIBED` sí bloquea marketing.

## Webhook Mailgun
Endpoint:
- `POST /api/communications/webhooks/mailgun/`

Requisitos:
- firma válida HMAC (timestamp + token, clave `MAILGUN_WEBHOOK_SIGNING_KEY`),
- idempotencia por `provider_event_id`.

Eventos procesados y efecto:
- `delivered`: confirma entrega en `EmailDelivery`.
- `failed` + `severity=temporary`: incrementa contador soft bounce; suprime desde 3.
- `failed` + permanente: supresión inmediata `HARD_BOUNCE`.
- `complained`: supresión inmediata `COMPLAINT`.
- `unsubscribed`: supresión `UNSUBSCRIBED`.

## Preferencias de usuario (marketing)
Endpoint autenticado:
- `GET /api/communications/preferences/me/`
- `PUT /api/communications/preferences/me/` con body:

```json
{ "marketing_opt_in": true }
```

Efecto:
- crea/actualiza preferencia,
- audita cambio en `EmailPreferenceAudit`,
- si pasa a `false`, crea/actualiza supresión `UNSUBSCRIBED`.

## One-click unsubscribe
Endpoint público:
- `GET /api/communications/unsubscribe/one-click/?token=<token>`
- `POST /api/communications/unsubscribe/one-click/` con `token`

Resultado:
- `marketing_opt_in=false`
- supresión `UNSUBSCRIBED` activa

## Verificación rápida (QA)
Desde `backend/`:

```bash
python manage.py test communications.tests notifications.tests users.tests_cookie_auth
```

Pruebas clave cubiertas:
- idempotencia de envío,
- bloqueo por supresión,
- idempotencia de webhook,
- baja one-click,
- compatibilidad doble canal notificación (in-app + email).

## Verificación operativa E2E (1 paso)
Desde la raíz del repo en PowerShell (`c:\Users\victor\proy\kampus`), con backend levantado en `http://localhost:8000`:

```powershell
# 1) Reset password (transaccional) + estado del último EmailDelivery
$body = @{ email = 'victor.puello@gmail.com' } | ConvertTo-Json
$resp = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/password-reset/request/' -Method Post -ContentType 'application/json' -Body $body
Write-Output ('RESET_RESPONSE=' + ($resp | ConvertTo-Json -Compress))

C:/Users/victor/proy/kampus/.venv/Scripts/python.exe C:/Users/victor/proy/kampus/backend/manage.py shell -c "from communications.models import EmailDelivery; d=EmailDelivery.objects.order_by('-id').first(); print('RESET_DELIVERY_ID=', d.id if d else None); print('RESET_DELIVERY_STATUS=', d.status if d else None); print('RESET_DELIVERY_EMAIL=', d.recipient_email if d else None); print('RESET_DELIVERY_CATEGORY=', d.category if d else None); print('RESET_DELIVERY_ERROR=', (d.error_message[:300] if d and d.error_message else ''))"

# 2) Notificación in-app + email + estado del último EmailDelivery
C:/Users/victor/proy/kampus/.venv/Scripts/python.exe C:/Users/victor/proy/kampus/backend/manage.py shell -c "from users.models import User; from notifications.services import create_notification; from communications.models import EmailDelivery; u=User.objects.get(email='victor.puello@gmail.com'); n=create_notification(recipient=u, title='Prueba notificación Kampus', body='Validación E2E desde runbook.', url='/notifications/test', type='system', dedupe_key='manual-notif-test-runbook'); d=EmailDelivery.objects.order_by('-id').first(); print('NOTIF_ID=', n.id); print('NOTIF_DELIVERY_ID=', d.id if d else None); print('NOTIF_DELIVERY_STATUS=', d.status if d else None); print('NOTIF_DELIVERY_CATEGORY=', d.category if d else None); print('NOTIF_DELIVERY_EMAIL=', d.recipient_email if d else None); print('NOTIF_DELIVERY_ERROR=', (d.error_message[:300] if d and d.error_message else ''))"
```

Resultado esperado:
- `RESET_DELIVERY_STATUS=SENT`
- `NOTIF_DELIVERY_STATUS=SENT`
- `NOTIF_DELIVERY_CATEGORY=in-app-notification`

Si falla con sandbox:
- autorizar destinatario en Mailgun (Authorized Recipients),
- confirmar invitación en el buzón,
- repetir bloque E2E.

## Monitoreo recomendado
- Tasa de `FAILED` y `SUPPRESSED` en `EmailDelivery`.
- Crecimiento diario de `EmailSuppression` por razón.
- Eventos webhook no procesados / firma inválida.
- Tasa de complaint y bounce por categoría de correo.

## Criterio de salida a producción
- [ ] Dominio Mailgun verificado (SPF/DKIM/DMARC).
- [ ] Webhook configurado con signing key correcta.
- [ ] Variables de entorno completas y `MAILGUN_WEBHOOK_STRICT=true`.
- [ ] Test suite focalizada en verde.
- [ ] Validación manual de unsubscribe one-click en entorno staging.

## Checklist pre-deploy (obligatorio)

### Configuración
- [ ] `KAMPUS_EMAIL_BACKEND=mailgun`.
- [ ] `MAILGUN_API_KEY` con **private key** (`key-...`), nunca `pubkey-...`.
- [ ] `MAILGUN_SENDER_DOMAIN` válido y verificado en Mailgun.
- [ ] `MAILGUN_API_URL` apuntando a región correcta:
  - US: `https://api.mailgun.net/v3`
  - EU: `https://api.eu.mailgun.net/v3`
- [ ] `MAILGUN_WEBHOOK_SIGNING_KEY` y `MAILGUN_WEBHOOK_STRICT=true`.
- [ ] `KAMPUS_BACKEND_BASE_URL` en URL pública real (HTTPS).

### Seguridad y compliance
- [ ] Rotar claves que se hayan expuesto en chats, tickets o capturas.
- [ ] Verificar que `.env` no esté versionado ni expuesto.
- [ ] Confirmar lista de destinatarios autorizados (si se usa sandbox).

### Validaciones funcionales mínimas
- [ ] Reset password termina en `EmailDelivery.status=SENT`.
- [ ] Notificación in-app por correo termina en `EmailDelivery.status=SENT`.
- [ ] Webhook `delivered/failed/complained/unsubscribed` llega con firma válida.

## Secuencia de deploy recomendada
1. Actualizar variables de entorno de backend con valores de producción.
2. Ejecutar despliegue de backend (imagen nueva + restart ordenado).
3. Correr verificación operativa E2E de este runbook.
4. Revisar `EmailDelivery` y `EmailEvent` por 15-30 minutos tras el release.
5. Confirmar métricas base: `FAILED`, `SUPPRESSED`, complaints y bounces.

## Rollback rápido (si falla email)
1. Cambiar temporalmente `KAMPUS_EMAIL_BACKEND=console` para cortar riesgo de entrega externa.
2. Reiniciar backend y verificar que flujos críticos (reset/notificación) no rompan UX.
3. Corregir credencial/región/dominio Mailgun.
4. Restablecer `KAMPUS_EMAIL_BACKEND=mailgun` y repetir verificación E2E.

## Evidencia a guardar por release
- Resultado de verificación E2E (salida consola con `SENT`).
- Captura de configuración de dominio y webhook en Mailgun (sin exponer secretos).
- Hash/versión desplegada + timestamp de inicio y cierre de validación.
