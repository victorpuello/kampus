# Estado actual de notificaciones en Kampus (contexto para integracion WhatsApp Meta)

## 1. Resumen breve del proyecto

Kampus es una plataforma educativa tipo monolito modular (Django REST + React) que centraliza procesos academicos y administrativos: estudiantes, docentes, asistencia, observador/convivencia, novedades, comisiones, reportes y comunicaciones.

- Backend: `backend/` (Django + DRF + Celery + Redis + Postgres/SQLite)
- Frontend: `kampus_frontend/` (React + TypeScript + Vite)
- API base: bajo `/api/` en `backend/kampus_backend/urls.py`

En materia de comunicaciones, hoy Kampus maneja 3 canales principales:

- Notificacion interna (in-app): tabla `notifications_notification`
- Correo saliente: stack `communications` con Mailgun/console + trazabilidad de entrega
- WhatsApp (Meta Cloud API): ya existe implementacion base operativa para envio y recepcion de estados

Este documento describe el estado real actual para que una persona nueva pueda entrar a desarrollar/ajustar la integracion de notificaciones con Meta (WhatsApp) con contexto tecnico completo.

## 2. Arquitectura funcional de notificaciones

### 2.1 Capas principales

- Capa de dominio (modulos de negocio): `academic`, `discipline`, `novelties`, `teachers`, `students`, `attendance`, etc.
- Capa de notificaciones in-app: app `notifications`
- Capa de comunicaciones externas (email/whatsapp): app `communications`
- Capa de orquestacion operativa: Celery tasks + management commands + scheduler + consola de operaciones (`reports`)

### 2.2 Flujo conceptual actual

1. Un evento de negocio llama `create_notification(...)` o `notify_users(...)`.
2. Se crea el registro in-app (`Notification`).
3. En el mismo flujo se intenta enviar correo (si esta habilitado).
4. Si WhatsApp global esta habilitado, se encola tarea Celery para envio por WhatsApp.
5. Webhooks de Mailgun/Meta actualizan estado de entregas y supresiones.

## 3. Notificaciones internas (in-app)

### 3.1 Modelo y estado de lectura

Archivo clave: `backend/notifications/models.py`

`Notification` guarda:

- `recipient` (usuario destino)
- `type`, `title`, `body`, `url`
- `dedupe_key` (evita spam por eventos repetidos)
- `created_at`, `read_at`

Estado:

- No leida: `read_at = null`
- Leida: `read_at != null`

Indices relevantes:

- `(recipient, read_at, created_at)` para bandeja y conteo
- `(recipient, dedupe_key, created_at)` para deduplicacion reciente

### 3.2 Servicio central de creacion

Archivo clave: `backend/notifications/services.py`

Funciones:

- `create_notification(...)`
- `notify_users(...)`
- `mark_all_read_for_user(...)`
- `admin_like_users_qs()`

Reglas importantes:

- Deduplicacion temporal por `dedupe_key + dedupe_within_seconds`
- `notify_users` filtra usuarios que ya recibieron la misma clave en la ventana
- `create_notification` crea 1 registro y dispara canales externos

### 3.3 API de consumo in-app

Backend:

- `GET /api/notifications/`
- `GET /api/notifications/unread-count/`
- `POST /api/notifications/{id}/mark-read/`
- `POST /api/notifications/mark-all-read/`

Archivos:

- `backend/notifications/views.py`
- `backend/notifications/urls.py`

Frontend:

- Servicio API: `kampus_frontend/src/services/notifications.ts`
- Pantalla de bandeja: `kampus_frontend/src/pages/Notifications.tsx`
- Badge y preview en layout: `kampus_frontend/src/layouts/DashboardLayout.tsx`

## 4. Correo saliente (estado actual)

## 4.1 Configuracion efectiva

Archivos:

- `backend/kampus_backend/settings.py`
- `backend/communications/runtime_settings.py`

Fuentes de configuracion:

- Variables de entorno
- Override persistido por entorno (`development` / `production`) en `MailgunSettings`

`apply_effective_mail_settings(...)` aplica en runtime:

- `EMAIL_BACKEND` (`console` o `anymail.backends.mailgun.EmailBackend`)
- `DEFAULT_FROM_EMAIL`, `SERVER_EMAIL`
- `ANYMAIL` y claves Mailgun

### 4.2 Motor de envio y trazabilidad

Archivo clave: `backend/communications/email_service.py`

`send_email(...)` implementa:

- Idempotencia por `recipient_email + idempotency_key`
- Registro de entrega en `EmailDelivery` (PENDING/SENT/FAILED/SUPPRESSED)
- Bloqueo por supresiones (`EmailSuppression`)
- Regla marketing: requiere `marketing_opt_in=true`
- Incluson automatica de disclaimer legal
- Encabezados `List-Unsubscribe` para marketing

Modelo de datos correo (en `backend/communications/models.py`):

- `EmailPreference`, `EmailPreferenceAudit`
- `EmailTemplate`
- `EmailDelivery`
- `EmailSuppression`
- `EmailEvent` (eventos webhook)
- `MailgunSettings`, `MailgunSettingsAudit`

### 4.3 Plantillas de correo

Archivo clave: `backend/communications/template_service.py`

Existe catalogo base de plantillas, por ejemplo:

- `password-reset`
- `mail-settings-test`
- `in-app-notification-generic`
- `novelty-sla-teacher`
- `novelty-sla-admin`
- `novelty-sla-coordinator`

`send_templated_email(...)` renderiza template + contexto + branding institucional y termina en `send_email(...)`.

### 4.4 Relacion in-app -> email

En `create_notification(...)` se llama `_send_notification_email(...)`.

Comportamiento:

- Respeta `NOTIFICATIONS_EMAIL_ENABLED`
- Si hay correo del usuario: intenta template por tipo
- Si falla template: fallback a `send_email(...)` con cuerpo plano

Nota importante de arquitectura:

- El envio de correo se ejecuta sincronamente dentro del flujo que crea la notificacion (no va por Celery hoy).

### 4.5 Webhook de Mailgun

Endpoint:

- `POST /api/communications/webhooks/mailgun/`

Archivo: `backend/communications/views.py` (`MailgunWebhookView`)

Proceso:

- Valida firma (`mailgun_webhook_signing_key`, modo estricto configurable)
- Deduplica eventos por `provider_event_id`
- Registra `EmailEvent`
- Actualiza `EmailDelivery` (delivered/failed/complained/unsubscribed)
- Actualiza supresiones (`EmailSuppression`)

## 5. WhatsApp actual (Meta Cloud API)

Aunque el objetivo de este documento es enfatizar internas + correo, para integracion Meta es clave conocer lo que ya existe.

### 5.1 Configuracion y modelos

Modelos en `backend/communications/models.py`:

- `WhatsAppSettings`
- `WhatsAppContact` (telefono por usuario)
- `WhatsAppTemplateMap` (notification_type -> template Meta)
- `WhatsAppDelivery`
- `WhatsAppEvent`
- `WhatsAppSuppression`
- `WhatsAppInstitutionMetric`

Settings runtime:

- `KAMPUS_WHATSAPP_*` en `backend/kampus_backend/settings.py`
- Resolucion efectiva en `backend/communications/runtime_settings.py`

### 5.2 Envio

Archivo clave: `backend/communications/whatsapp_service.py`

Rutas de envio:

- `send_whatsapp(...)` (texto)
- `send_whatsapp_template(...)` (template Meta)
- `send_whatsapp_notification(...)` (decision por `send_mode` + mapeo)

Reglas:

- Requiere canal habilitado (`enabled=true`)
- Idempotencia por `recipient_phone + idempotency_key`
- Soporta supresiones
- Registra `WhatsAppDelivery` con estados

### 5.3 Relacion in-app -> WhatsApp

En `backend/notifications/services.py`:

- Si `KAMPUS_WHATSAPP_ENABLED=true`, se programa `send_notification_whatsapp_task` en `transaction.on_commit(...)`

Tarea:

- `notifications.send_notification_whatsapp` en `backend/notifications/tasks.py`
- Busca `WhatsAppContact` activo
- Resuelve institucion para metricas
- Llama `send_whatsapp_notification(...)`

### 5.4 Webhook Meta

Endpoint actual:

- `GET/POST /api/communications/webhooks/whatsapp/meta/`

Archivo: `backend/communications/views.py` (`WhatsAppMetaWebhookView`)

GET:

- Verificacion de webhook con `hub.verify_token` y `hub.challenge`

POST:

- Valida firma HMAC `X-Hub-Signature-256` con `app_secret`
- Usa `request._request.body` para evitar errores de raw body ya parseado
- Extrae estados (`sent`, `delivered`, `read`, `failed`)
- Registra `WhatsAppEvent`
- Actualiza `WhatsAppDelivery`
- Crea/actualiza `WhatsAppSuppression` segun codigos de error

## 6. Jobs, scheduler y ejecucion periodica

Kampus hoy usa 2 mecanismos de ejecucion periodica en paralelo:

- Celery Beat (`backend_beat`)
- Scheduler tipo bucle en contenedor `backend_scheduler` (while true + management commands)

Esto da flexibilidad, pero obliga a tener claridad para no duplicar responsabilidades.

### 6.1 Jobs periodicos en Celery Beat

Configurados en `backend/kampus_backend/settings.py` via `CELERY_BEAT_SCHEDULE`:

- `novelties.notify_novelties_sla`
- `notifications.check_notifications_health`
- `notifications.check_whatsapp_health` (si `KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED=true`)
- `teachers.notify_pending_planning_teachers`

### 6.2 Jobs en backend_scheduler (loops)

Definidos en `docker-compose.yml` servicio `backend_scheduler`:

- `notify_descargos_deadlines`
- `close_expired_attendance_sessions`
- `cleanup_report_jobs`
- `sync_election_census`
- `notify_novelties_sla`
- `check_notifications_health --no-fail-on-breach`

Observacion operativa:

- Si se habilitan simultaneamente loops y beat para la misma responsabilidad, se puede incrementar riesgo de ejecucion duplicada (mitigada parcialmente por dedupe/idempotencia, pero no ideal).

### 6.3 Commands de salud y alerta

`check_notifications_health` (`backend/notifications/management/commands/check_notifications_health.py`):

- Ventana configurable (`--hours`)
- Evalua `EmailDelivery`: sent/failed/suppressed
- Breach por umbrales (`max_failed`, `max_suppressed`, `min_success_rate`)
- Puede notificar admins con `notify_users(...)`
- Puede fallar comando segun bandera (`fail-on-breach`)

`check_whatsapp_health` (`backend/communications/management/commands/check_whatsapp_health.py`):

- Evalua `WhatsAppDelivery`: sent/delivered/read/failed/suppressed
- Calcula `success_rate`
- Persiste metricas por institucion en `WhatsAppInstitutionMetric`
- Puede notificar admins in-app

### 6.4 Trazabilidad de ejecuciones periodicas

Modelo `PeriodicJobRun` (`backend/reports/models.py`):

- Estados: `PENDING/RUNNING/SUCCEEDED/FAILED`
- Guarda salida (`output_text`) y error

Modelo `PeriodicJobRuntimeConfig`:

- `enabled_override`
- `params_override`
- `schedule_override`

Las tasks wrapper (`novelties/tasks.py`, `teachers/tasks.py`, `notifications/tasks.py`) actualizan `PeriodicJobRun` al ejecutar comandos.

## 7. Casos de negocio que hoy disparan notificaciones

No es una lista exhaustiva de todo el repo, pero si de los flujos mas relevantes identificados en codigo.

### 7.1 Planeacion docente

Archivo: `backend/teachers/management/commands/notify_pending_planning_teachers.py`

- Detecta docentes con planeacion faltante o incompleta
- Crea notificaciones tipo:
  - `PLANNING_REMINDER_MISSING`
  - `PLANNING_REMINDER_INCOMPLETE`

### 7.2 SLA de novedades

Archivo: `backend/novelties/management/commands/notify_novelties_sla.py`

- Notifica docentes por casos IN_REVIEW vencidos
- Escala a admins/coordinadores
- Tipos:
  - `NOVELTY_SLA_TEACHER`
  - `NOVELTY_SLA_ADMIN`
  - `NOVELTY_SLA_COORDINATOR`

### 7.3 Disciplina / observador

Archivos:

- `backend/discipline/views.py`
- `backend/discipline/management/commands/notify_descargos_deadlines.py`

Incluye:

- Notificacion al crear caso disciplinario
- Notificacion a acudientes cuando aplica
- Alertas por plazos de descargos por vencer/vencidos

### 7.4 Solicitudes de edicion academica

Archivo: `backend/academic/views.py`

- Al crear solicitud: notifica admins (`EDIT_REQUEST_PENDING`)
- Al aprobar/rechazar: notifica docente (`EDIT_REQUEST_APPROVED` / `EDIT_REQUEST_REJECTED`)

### 7.5 Observador automatico por bajo desempeño

Archivo: `backend/students/services/observer_annotations.py`

- Cuando hay mas de 3 asignaturas en bajo desempeño, crea alerta al director de grupo (`OBSERVADOR_ALERT`)

### 7.6 Asistencia

Archivo: `backend/attendance/views.py`

- Solicitud de eliminacion de planilla por docente notifica a perfiles administrativos (`ATTENDANCE_DELETE_REQUEST`)

### 7.7 Comisiones academicas

Archivo: `backend/academic/commission_views.py`

- Generacion de acta de compromiso puede notificar director de grupo (`COMMISSION_ACTA`)

### 7.8 Verificacion publica de certificados

Archivo: `backend/students/views.py`

- Accesos a verificacion publica disparan aviso a usuarios admin-like (`CERTIFICATE_VERIFY`)

## 8. Endpoints de administracion y observabilidad utiles para onboarding

## 8.1 Comunicaciones

- `GET/PUT /api/communications/settings/mailgun/`
- `POST /api/communications/settings/mailgun/test/`
- `GET /api/communications/settings/mailgun/audits/`
- `GET /api/communications/settings/mailgun/audits/export/`

- `GET/PUT /api/communications/settings/whatsapp/`
- `GET/PUT /api/communications/settings/whatsapp/templates/`
- `PUT/DELETE /api/communications/settings/whatsapp/templates/{map_id}/`
- `GET /api/communications/settings/whatsapp/health/`
- `GET/PUT/DELETE /api/communications/whatsapp/me/`

- `POST /api/communications/webhooks/mailgun/`
- `GET/POST /api/communications/webhooks/whatsapp/meta/`

## 8.2 Operaciones de jobs

En `reports`:

- `GET /api/reports/operations/jobs/overview/`
- `POST /api/reports/operations/jobs/run-now/`
- `GET /api/reports/operations/jobs/periodic-runs/{run_id}/logs/`
- `POST /api/reports/operations/jobs/toggle/`
- `POST /api/reports/operations/jobs/params/`
- `POST /api/reports/operations/jobs/schedule/`

Nota:

- En consola de operaciones actualmente se exponen 3 job keys (`notify-novelties-sla`, `check-notifications-health`, `notify-pending-planning-teachers`).
- `check-whatsapp-health` si existe como task/command, pero no aparece en ese snapshot de jobs de operaciones hoy.

## 9. Mecanismos de control anti-duplicado

Hay dos estrategias complementarias:

- Deduplicacion funcional (notificaciones): `dedupe_key + dedupe_within_seconds`
- Idempotencia de canal:
  - Email: `notif-email:{user}:{hash}`
  - WhatsApp: `notif-wa:{user}:{hash}`

El hash base se deriva de `dedupe_key` o del `notification_id` si no hay dedupe key.

## 10. Estado actual y recomendaciones para quien entra a integrar Meta

### 10.1 Lo que ya esta resuelto

- Canal in-app estable y ampliamente usado por dominios
- Puente in-app -> email implementado con templates y trazabilidad
- Puente in-app -> WhatsApp implementado con task asincrona
- Webhook Meta implementado con verificacion y actualizacion de estados
- Mapeo `notification_type -> template Meta` disponible por API/admin
- Endpoint de salud WhatsApp disponible

### 10.2 Puntos a vigilar al iniciar desarrollo

- Correo se envia de forma sincronica en `create_notification` (impacto en latencia de requests mas sensibles)
- Coexisten Beat y scheduler por loops: revisar estrategia por entorno para evitar duplicidad operativa
- Alinear `notification_type` usados por negocio con `WhatsAppTemplateMap` para maximo coverage
- Confirmar politicas de supresion/errores Meta para codigos nuevos
- Incluir `check-whatsapp-health` dentro de la consola de operaciones si se requiere control unificado

### 10.3 Checklist tecnico inicial recomendado

1. Validar settings efectivos por entorno (`/settings/whatsapp` y `/settings/mailgun`).
2. Verificar que usuarios de prueba tengan `WhatsAppContact` activo.
3. Confirmar mapeos activos en `/settings/whatsapp/templates/` para tipos de notificacion de mayor trafico.
4. Disparar un flujo real de negocio que cree `Notification` y validar cascada:
   - `Notification` creada
   - `EmailDelivery` generado
   - `WhatsAppDelivery` generado
5. Confirmar callback Meta en `/webhooks/whatsapp/meta/` y transicion a `DELIVERED/READ`.
6. Revisar `GET /api/communications/settings/whatsapp/health/?hours=24`.

## 11. Mapa rapido de archivos clave

- Nucleo notificaciones: `backend/notifications/services.py`
- Modelo in-app: `backend/notifications/models.py`
- API in-app: `backend/notifications/views.py`
- Tasks notificaciones: `backend/notifications/tasks.py`

- Modelos comunicaciones: `backend/communications/models.py`
- Email service: `backend/communications/email_service.py`
- Templates email: `backend/communications/template_service.py`
- WhatsApp service: `backend/communications/whatsapp_service.py`
- Views/webhooks/settings: `backend/communications/views.py`
- URLs comunicaciones: `backend/communications/urls.py`

- Runtime settings: `backend/communications/runtime_settings.py`
- Settings globales: `backend/kampus_backend/settings.py`
- Entrypoint API: `backend/kampus_backend/urls.py`

- Jobs operativos y trazabilidad: `backend/reports/models.py`, `backend/reports/views.py`, `backend/reports/urls.py`
- Scheduler loops dev: `docker-compose.yml` (servicio `backend_scheduler`)
