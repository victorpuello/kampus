# Estado actual de notificaciones en Kampus (contexto para integracion WhatsApp Meta)

Actualizado: 2026-03-05

## 1. Que es Kampus (contexto rapido para nuevo integrante)

Kampus es un monorepo educativo con backend en Django REST y frontend en React + TypeScript.

- Backend: `backend/`
- Frontend: `kampus_frontend/`
- API principal: `backend/kampus_backend/urls.py`
- Persistencia: Postgres en docker, con fallback a SQLite en local si no hay `POSTGRES_DB`
- Jobs async: Celery + Redis
- Ejecucion periodica: Celery Beat y tambien loops en `backend_scheduler`

En terminos de comunicaciones, hoy existen 3 capas conectadas:

1. Notificacion interna (in-app) en app `notifications`.
2. Correo saliente (Mailgun/console) en app `communications`.
3. Canal WhatsApp (Meta Cloud API) tambien en `communications`, ya operativo con envio y webhook.

Este documento describe como se mueve una notificacion hoy y cual es el estado real para continuar la integracion con Meta/WhatsApp sin perder contexto.

## 2. Vista general de arquitectura de notificaciones

### 2.1 Piezas principales

- Modelo in-app: `backend/notifications/models.py` (`Notification`).
- Servicio de orquestacion: `backend/notifications/services.py`.
- Outbox por canal: `NotificationDispatch` en `backend/notifications/models.py`.
- Procesador de outbox: `backend/notifications/dispatch.py` + command `process_notification_dispatches`.
- Envio correo: `backend/communications/email_service.py` y `template_service.py`.
- Envio WhatsApp: `backend/communications/whatsapp_service.py`.
- Webhooks: `MailgunWebhookView` y `WhatsAppMetaWebhookView` en `backend/communications/views.py`.
- API in-app para frontend: `backend/notifications/views.py`.

### 2.2 Flujo funcional actual (end-to-end)

1. Un modulo de negocio llama `create_notification(...)` o `notify_users(...)`.
2. Se crea registro in-app en `Notification`.
3. Se hace upsert de `NotificationType` si llega `type`.
4. Se crea `NotificationDispatch` para email (si canal aplica).
5. Se crea `NotificationDispatch` para WhatsApp (si canal aplica).
6. Si `KAMPUS_NOTIFICATIONS_OUTBOX_ONLY=false`:
   - email se intenta enviar en el mismo flujo con `_send_notification_email(...)`;
   - WhatsApp se encola con Celery (`send_notification_whatsapp_task`) en `transaction.on_commit(...)`.
7. Si `KAMPUS_NOTIFICATIONS_OUTBOX_ONLY=true`, ambos canales quedan diferidos al outbox.
8. El command/tarea `process_notification_dispatches` consume pendientes/fallidos y aplica retries con backoff.
9. Webhooks (Mailgun/Meta) actualizan estados de deliveries y supresiones.

## 3. Notificacion interna (in-app)

### 3.1 Modelo

Archivo: `backend/notifications/models.py`

`Notification` guarda:

- `recipient`
- `dedupe_key`
- `type`
- `title`
- `body`
- `url`
- `created_at`
- `read_at`

Estado de lectura:

- No leida: `read_at is null`
- Leida: `read_at is not null`

Indices importantes:

- `(recipient, read_at, created_at)` para bandeja/conteo.
- `(recipient, dedupe_key, created_at)` para dedupe.

### 3.2 API in-app

Archivos:

- `backend/notifications/urls.py`
- `backend/notifications/views.py`
- `backend/notifications/serializers.py`

Endpoints:

- `GET /api/notifications/`
- `GET /api/notifications/unread-count/`
- `POST /api/notifications/{id}/mark-read/`
- `POST /api/notifications/mark-all-read/`

### 3.3 Consumo frontend

Archivos:

- `kampus_frontend/src/services/notifications.ts`
- `kampus_frontend/src/pages/Notifications.tsx`
- `kampus_frontend/src/layouts/DashboardLayout.tsx`

Comportamiento actual UI:

- Poll de no leidas cada 30s en `DashboardLayout`.
- Evento local `kampus:notifications-updated` para sincronizar badge/vistas.
- Bandeja dedicada en `/notifications` con filtro, busqueda, detalle, mark-read y mark-all-read.

## 4. Correo saliente (estado actual)

### 4.1 Modelo de datos de email

Archivo: `backend/communications/models.py`

Tablas clave:

- `EmailDelivery`: trazabilidad de cada intento (`PENDING`, `SENT`, `FAILED`, `SUPPRESSED`).
- `EmailSuppression`: supresion por hard bounce, complaint, unsubscribed, etc.
- `EmailEvent`: eventos webhook deduplicados por `provider_event_id`.
- `EmailTemplate`: plantillas editables.
- `EmailPreference` y `EmailPreferenceAudit`: opt-in marketing.
- `MailgunSettings` y `MailgunSettingsAudit`: configuracion por entorno y trazabilidad de cambios.

### 4.2 Configuracion efectiva (env + DB)

Archivos:

- `backend/kampus_backend/settings.py`
- `backend/communications/runtime_settings.py`

Regla actual:

- Se parte de variables de entorno.
- Si existe `MailgunSettings` para el entorno efectivo (`development` o `production`), esa configuracion prevalece.
- `apply_effective_mail_settings(...)` actualiza `settings` en runtime.

Variables relevantes (ejemplos):

- `KAMPUS_EMAIL_BACKEND`
- `DEFAULT_FROM_EMAIL`
- `MAILGUN_API_KEY`
- `MAILGUN_SENDER_DOMAIN`
- `MAILGUN_WEBHOOK_SIGNING_KEY`

### 4.3 Envio de correo

Archivo: `backend/communications/email_service.py`

`send_email(...)` implementa:

- Idempotencia por `(recipient_email, idempotency_key)`.
- Registro persistente en `EmailDelivery`.
- Supresion por tabla `EmailSuppression`.
- Bloqueo marketing si `marketing_opt_in=false`.
- Disclaimer legal agregado automatico (texto/html).
- `List-Unsubscribe` para categorias marketing.

### 4.4 Plantillas de correo

Archivo: `backend/communications/template_service.py`

- Catalogo base incluye `in-app-notification-generic`, `novelty-sla-*`, `password-reset`, etc.
- Para notificaciones in-app se usa `send_templated_email(...)` y, si falla, fallback a `send_email(...)` plano.

Mapeo de plantillas por tipo (hoy):

- `NOVELTY_SLA_TEACHER` -> `novelty-sla-teacher`
- `NOVELTY_SLA_ADMIN` -> `novelty-sla-admin`
- `NOVELTY_SLA_COORDINATOR` -> `novelty-sla-coordinator`
- Otros -> `in-app-notification-generic`

### 4.5 Relacion Notification -> email

Archivo: `backend/notifications/services.py`

- Se crea `NotificationDispatch` canal `EMAIL`.
- Adicionalmente, si `KAMPUS_NOTIFICATIONS_OUTBOX_ONLY=false`, se envia en caliente via `_send_notification_email(...)`.
- El idempotency key de email se deriva de `dedupe_key` o `notification_id` (hash sha256 recortado).

### 4.6 Webhook Mailgun

Archivos:

- `backend/communications/urls.py`
- `backend/communications/views.py`

Endpoint:

- `POST /api/communications/webhooks/mailgun/`

Proceso:

1. Validacion de firma Mailgun (`MAILGUN_WEBHOOK_SIGNING_KEY`, strict configurable).
2. Dedupe de eventos por `provider_event_id`.
3. Persistencia de `EmailEvent`.
4. Actualizacion de `EmailDelivery`.
5. Gestion de supresiones (`EmailSuppression`) para `failed`, `complained`, `unsubscribed`.

## 5. WhatsApp actual (Meta Cloud API)

### 5.1 Estado de madurez actual

El canal no esta solo en plan: ya existe implementacion funcional de envio, trazabilidad, supresion y webhook. La integracion pendiente normalmente sera endurecer reglas de negocio, plantillas y operacion, no partir desde cero.

### 5.2 Modelo de datos WhatsApp

Archivo: `backend/communications/models.py`

Tablas clave:

- `WhatsAppSettings`: config por entorno.
- `WhatsAppContact`: telefono por usuario (OneToOne).
- `WhatsAppTemplateMap`: mapeo `notification_type -> template_name`.
- `WhatsAppDelivery`: tracking (`PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `SUPPRESSED`, `SKIPPED`).
- `WhatsAppSuppression`: numeros bloqueados/suprimidos.
- `WhatsAppEvent`: eventos webhook deduplicados.
- `WhatsAppInstitutionMetric`: metricas por institucion y ventana temporal.

### 5.3 Configuracion efectiva de WhatsApp

Archivos:

- `backend/kampus_backend/settings.py`
- `backend/communications/runtime_settings.py`

Variables relevantes:

- `KAMPUS_WHATSAPP_ENABLED`
- `KAMPUS_WHATSAPP_PHONE_NUMBER_ID`
- `KAMPUS_WHATSAPP_ACCESS_TOKEN`
- `KAMPUS_WHATSAPP_APP_SECRET`
- `KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `KAMPUS_WHATSAPP_SEND_MODE` (`template` o `text`)
- `KAMPUS_WHATSAPP_TEMPLATE_FALLBACK_NAME`
- `KAMPUS_WHATSAPP_ALLOW_TEXT_WITHOUT_TEMPLATE`
- limites throttle por telefono e institucion

### 5.4 Envio WhatsApp

Archivo: `backend/communications/whatsapp_service.py`

Funciones:

- `send_whatsapp(...)`: mensaje texto.
- `send_whatsapp_template(...)`: plantilla Meta.
- `send_whatsapp_notification(...)`: wrapper para notificaciones.

Logica de `send_whatsapp_notification(...)`:

1. Lee configuracion efectiva (`enabled`, `send_mode`, fallback template).
2. Busca `WhatsAppTemplateMap` por `notification_type`.
3. Si modo template y hay template: envia template con parametros.
4. Si falta template:
   - si tipo requiere plantilla o `ALLOW_TEXT_WITHOUT_TEMPLATE=false`, crea `SKIPPED` con `NO_TEMPLATE`.
   - si esta permitido, hace fallback a texto.
5. Aplica idempotencia por `(recipient_phone, idempotency_key)`.
6. Aplica throttle por minuto (telefono/institucion) via cache.
7. Registra `WhatsAppDelivery` y metadata de proveedor.

### 5.5 Relacion Notification -> WhatsApp

Archivos:

- `backend/notifications/services.py`
- `backend/notifications/tasks.py`

Flujo:

- En `create_notification(...)` se crea `NotificationDispatch` canal `WHATSAPP` si canal habilitado por config global y por `NotificationType`.
- Si no es outbox-only, se encola `send_notification_whatsapp_task`.
- La task valida contacto activo en `WhatsAppContact`, construye fallback text y llama `send_whatsapp_notification(...)`.

### 5.6 Webhook Meta

Archivos:

- `backend/communications/urls.py`
- `backend/communications/views.py`

Endpoint:

- `GET /api/communications/webhooks/whatsapp/meta/` (verificacion)
- `POST /api/communications/webhooks/whatsapp/meta/` (eventos)

Proceso POST:

1. Validacion HMAC `X-Hub-Signature-256` con `app_secret`.
2. Extraccion de `statuses` (`sent`, `delivered`, `read`, `failed`).
3. Dedupe por `provider_event_id` en `WhatsAppEvent`.
4. Actualizacion de estado en `WhatsAppDelivery`.
5. Clasificacion de errores y supresion permanente en `WhatsAppSuppression` para ciertos codigos.

## 6. Outbox y retries (pieza critica para integracion)

### 6.1 NotificationDispatch

Archivo: `backend/notifications/models.py`

Campos operativos:

- `channel` (`EMAIL`, `WHATSAPP`)
- `status` (`PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `DEAD_LETTER`)
- `attempts`
- `next_retry_at`
- `idempotency_key`
- `payload`, `error_message`, `processed_at`

Garantias:

- Unique parcial por `(channel, idempotency_key)` cuando key no vacia.
- Idempotencia de outbox sin romper flujo de negocio (captura `IntegrityError`).

### 6.2 Procesador del outbox

Archivos:

- `backend/notifications/management/commands/process_notification_dispatches.py`
- `backend/notifications/dispatch.py`

Comportamiento:

- Toma lote de `PENDING` y `FAILED` listos para reintento (`next_retry_at <= now`).
- Hace claim optimista de filas (`status -> IN_PROGRESS`) para evitar doble proceso.
- Ejecuta canal email o whatsapp.
- Exito: `SUCCEEDED` + `processed_at`.
- Error: `FAILED` con backoff exponencial (tope 1h); cuando supera max retries pasa a `DEAD_LETTER`.

## 7. Jobs periodicos y scheduler (estado real)

### 7.1 Celery Beat

Archivo: `backend/kampus_backend/settings.py`

Jobs de notificaciones/comunicaciones disponibles por toggles env:

- `notifications.check_notifications_health`
- `notifications.check_whatsapp_health`
- `notifications.process_dispatch_outbox`
- `notifications.check_dispatch_outbox_health`

Todos se activan con flags `*_BEAT_ENABLED`.

### 7.2 backend_scheduler por loops

Archivo: `docker-compose.yml` (servicio `backend_scheduler`)

Tambien ejecuta loops de comandos, incluyendo:

- `check_notifications_health --no-fail-on-breach`
- `process_notification_dispatches` (si loop enabled)

Implicacion operativa:

- Existen dos mecanismos (Beat y loops). Si se habilitan ambos para el mismo job, hay riesgo de duplicidad de ejecucion.
- Hay locks por cache en varias tasks wrapper para mitigar overlap, pero la recomendacion es definir una sola via por ambiente.

### 7.3 Comandos de salud

- `check_notifications_health` (`backend/notifications/management/commands/check_notifications_health.py`): analiza `EmailDelivery` en ventana, aplica umbrales y puede crear alerta in-app a admins.
- `check_whatsapp_health` (`backend/communications/management/commands/check_whatsapp_health.py`): analiza `WhatsAppDelivery`, calcula success rate, guarda metricas por institucion y puede alertar admins.
- `check_dispatch_outbox_health` (`backend/notifications/management/commands/check_dispatch_outbox_health.py`): monitorea acumulacion `PENDING/FAILED/DEAD_LETTER` y edad de pendientes.

## 8. Consola operativa para jobs y observabilidad

Archivo: `backend/reports/views.py`

Endpoints de operaciones relevantes:

- `GET /api/reports/operations/jobs/overview/`
- `POST /api/reports/operations/jobs/run-now/`
- `GET /api/reports/operations/jobs/periodic-runs/{run_id}/logs/`
- `POST /api/reports/operations/jobs/toggle/`
- `POST /api/reports/operations/jobs/params/`
- `POST /api/reports/operations/jobs/schedule/`

`run-now` soporta hoy estos `job_key`:

- `notify-novelties-sla`
- `check-notifications-health`
- `check-whatsapp-health`
- `process-notification-dispatch-outbox`
- `check-dispatch-outbox-health`
- `notify-pending-planning-teachers`

Tambien hay endpoint de salud WhatsApp:

- `GET /api/communications/settings/whatsapp/health/`

Y baseline de notificaciones:

- `GET /api/communications/settings/notifications/baseline/`

## 9. Donde se generan notificaciones de negocio (ejemplos importantes)

Buscando usos de `create_notification(...)` y `notify_users(...)` se ven, entre otros:

- `backend/novelties/management/commands/notify_novelties_sla.py`
- `backend/teachers/management/commands/notify_pending_planning_teachers.py`
- `backend/attendance/views.py`
- `backend/academic/views.py`
- `backend/academic/commission_views.py`
- `backend/students/services/observer_annotations.py`
- `backend/students/views.py`

Esto confirma que el sistema de notificaciones ya esta transversal a varios modulos de negocio.

## 10. Riesgos tecnicos y puntos finos a cuidar en la integracion Meta

1. Doble via de ejecucion periodica (Beat + loops).
   - Definir una estrategia por ambiente para evitar ruido operativo.

2. Mezcla de envio inmediato y outbox.
   - Hoy puede haber envio en caliente y tambien registro outbox del mismo evento; esto mejora resiliencia, pero hay que vigilar consistencia de politicas para evitar confusiones operativas.

3. Plantillas WhatsApp por tipo.
   - Si `send_mode=template` y no hay mapeo/fallback, se generan `SKIPPED:NO_TEMPLATE`.
   - La calidad de la integracion depende de completar `WhatsAppTemplateMap` para tipos reales.

4. Datos de contacto.
   - Sin `WhatsAppContact` activo no hay envio por WhatsApp.

5. Idempotencia por canal.
   - Mantener `idempotency_key` estable por evento de negocio para no duplicar envios.

6. Supresiones.
   - Email y WhatsApp tienen tablas de supresion; cualquier nueva logica debe respetarlas.

## 11. Recomendacion de onboarding tecnico para el nuevo desarrollador

Orden sugerido para entrar al modulo:

1. Leer este archivo y luego `docs/guia_configuracion_whatsapp_meta_cloud_api.md`.
2. Revisar `backend/notifications/services.py` y `backend/notifications/dispatch.py`.
3. Revisar `backend/communications/whatsapp_service.py` y `backend/communications/views.py` (webhook).
4. Validar `WhatsAppSettings` y `WhatsAppTemplateMap` via endpoints admin.
5. Probar flujo completo:
   - crear notificacion de un tipo conocido,
   - verificar registro in-app,
   - verificar `NotificationDispatch`,
   - verificar `WhatsAppDelivery`,
   - simular/recibir webhook y confirmar cambio de estado.

## 12. Resumen ejecutivo

Estado actual del proyecto en notificaciones:

- In-app: estable y ya integrado al frontend.
- Email: maduro, con templates, idempotencia, webhook y supresiones.
- WhatsApp Meta: base funcional completa (envio, template map, webhook, metricas, supresiones).
- Operacion: existe monitoreo de salud y outbox, con capacidad de ejecucion manual y programada.

Para la integracion Meta que sigue, el trabajo principal es consolidar reglas, cobertura de plantillas por tipo de notificacion, y estandarizar operacion (scheduler/outbox), mas que construir infraestructura desde cero.
