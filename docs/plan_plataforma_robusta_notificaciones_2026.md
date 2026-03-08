# Plan: Plataforma robusta de notificaciones 2026

Estado: **CERRADO (100%)**  
Última validación: **2026-03-07**

Este plan final evoluciona el sistema actual hacia una plataforma multicanal robusta para docentes, administradores y estudiantes, manteniendo lo que ya funciona (outbox, KPIs, canales existentes) y agregando gobernanza, configuración y operación de nivel producto.

La estrategia reduce riesgo por fases: primero estandariza reglas y permisos, después incorpora el ciclo formal de templates de WhatsApp con aprobación, luego endurece políticas de envío, y finalmente habilita UI integral y observabilidad avanzada.

Quedan fijadas las decisiones clave:
- Catálogo global de templates WhatsApp.
- Aprobación solo `SuperAdmin`.
- Bloqueo estricto de WhatsApp sin template aprobado.
- Correo con alcance completo (transaccional + campañas + preferencias + digest).

## Estado por sprint

| Sprint | Estado |
|---|---|
| Sprint 0 — Baseline y hardening | 100% |
| Sprint 1 — Dominio unificado de políticas por audiencia | 100% |
| Sprint 1 (paralelo) — Gobernanza y permisos | 100% |
| Sprint 2 — Workflow de templates WhatsApp | 100% |
| Sprint 2 (paralelo) — Integración con Meta para aprobación | 100% |
| Sprint 3 — Enforcement estricto de envío WhatsApp | 100% |
| Sprint 3 (paralelo) — Correo como canal de primer nivel | 100% |
| Sprint 4 — Centro de preferencias de correo | 100% |
| Sprint 4 (paralelo) — UI integral de configuración | 100% |
| Sprint 5 — Observabilidad y SLA | 100% |
| Sprint 6 — Piloto y rollout gradual | 100% |

## Evidencia de cierre técnico

- Corrección de bloqueador E2E de webhook WhatsApp en `backend/communications/tests.py` (setup con `app_secret` y firma estricta consistente).
- Bloqueador de migraciones resuelto con `backend/communications/migrations/0029_rename_communicatio_approva_becfe2_idx_communicati_approva_b0e43a_idx_and_more.py`.
- Validación de migraciones sin drift: `python manage.py makemigrations --check --dry-run` → sin cambios pendientes.
- Validaciones backend ejecutadas y aprobadas:
	- `notifications.tests.NotificationObservabilityCommandsTests`
	- `novelties.tests.NoveltySlaNotificationsCommandTests`
	- `communications.tests.WhatsAppTemplateAndHealthAdminTests`
	- `communications.tests.WhatsAppNotificationE2ETests.test_notification_task_and_webhook_updates_delivery`
- Validación frontend aprobada: `cd kampus_frontend && npm run lint`.
- Health/KPI operacional ejecutado con tarea `Notifications: KPI + Health`.

## Steps

### Sprint 0 (1 semana) — Baseline y hardening
**Objetivo:** estabilizar operación actual.

**Entregables:**
- Inventario funcional y técnico.
- Contratos API actuales.
- Mapa de jobs y riesgos en `services.py`, `dispatch.py`, `runtime_settings.py`, `views.py`, `SystemSettings.tsx`.

**Salida:**
- Checklist de readiness firmado.

### Sprint 1 (2 semanas) — Dominio unificado de políticas por audiencia
**Objetivo:** definir qué se envía, a quién, por qué canal y con qué prioridad.

**Entregables:**
- Matriz de eventos por rol/canal/criticidad.
- Reglas por institución.
- Defaults por canal en `models.py`, `views.py`, `urls.py`.

**Salida:**
- APIs CRUD de reglas listas.

### Sprint 1 (paralelo) — Gobernanza y permisos
**Objetivo:** separar creador de aprobador y proteger operaciones críticas.

**Entregables:**
- Permisos de configuración para `Admin`.
- Aprobación WhatsApp solo `SuperAdmin` usando patrones de `permissions.py`.

**Salida:**
- Matriz RBAC validada con QA.

### Sprint 2 (2 semanas) — Workflow de templates WhatsApp
**Objetivo:** ciclo formal `Draft → Submitted → Approved/Rejected → Deprecated`.

**Entregables:**
- Versionado.
- Auditoría y trazabilidad de decisiones en `models.py`, `views.py`, `urls.py`.

**Salida:**
- Flujo completo de aprobación funcional.

### Sprint 2 (paralelo) — Integración con Meta para aprobación
**Objetivo:** enviar templates y reconciliar estado.

**Entregables:**
- Servicio de submit/sync.
- Reconciliación de mappings en `whatsapp_service.py` y `template_service.py`.

**Salida:**
- Sincronización de estados operativa.

### Sprint 3 (2 semanas) — Enforcement estricto de envío WhatsApp
**Objetivo:** cero envíos sin template aprobado.

**Entregables:**
- Validación previa.
- Error estructurado.
- Ruteo alterno por otros canales en `dispatch.py`, `process_notification_dispatches.py`.

**Salida:**
- Política de bloqueo en producción.

### Sprint 3 (paralelo) — Correo como canal de primer nivel
**Objetivo:** cobertura completa de email.

**Entregables:**
- Catálogo transaccional + campañas + digest.
- Plantillas versionadas.
- `suppression`/`bounce`/`complaint handling`.
- Reglas de frecuencia en `email_service.py`, `template_service.py`, `views.py`.

**Salida:**
- Flujos de envío y control de reputación listos.

### Sprint 4 (2 semanas) — Centro de preferencias de correo
**Objetivo:** consentimiento granular para no críticos.

**Entregables:**
- Preferencias por categoría para estudiantes y usuarios.
- Excepciones para correos obligatorios.
- Historial de cambios y auditoría en `models.py`, `views.py`, `notifications.ts`.

**Salida:**
- Cumplimiento funcional de opt-in/opt-out.

### Sprint 4 (paralelo) — UI integral de configuración
**Objetivo:** operación autoservicio.

**Entregables:**
- Consola única con pestañas `Reglas`, `Templates WhatsApp`, `Aprobaciones`, `Email`, `Preferencias`, `Historial` y `KPIs` en `SystemSettings.tsx`, `system.ts`, `Notifications.tsx`.

**Salida:**
- UX validada por admins de negocio.

### Sprint 5 (1-2 semanas) — Observabilidad y SLA
**Objetivo:** controlar calidad de extremo a extremo.

**Entregables:**
- KPIs de entrega por canal/rol/evento.
- Lead time de aprobación.
- Rechazo de templates.
- Rebote y queja email.
- Dead-letter y latencia en `report_notifications_kpis.py`, `check_notifications_health.py`, `check_whatsapp_health.py`.

**Salida:**
- Umbrales y alertas activos.

### Sprint 6 (1 semana) — Piloto y rollout gradual
**Objetivo:** salida segura a producción.

**Entregables:**
- Feature flags por institución.
- Runbooks de incidentes.
- Plan de reversa.
- Capacitación operativa.

**Salida:**
- Go-live con ventana de estabilización y criterios go/no-go.

## Verification

- **Backend:** pruebas por app impactada con `python manage.py test`.
- **Frontend:** validación estática con `cd kampus_frontend && npm run lint` y pruebas manuales de flujos críticos.
- **Operación:** ejecución diaria de KPIs y health usando la tarea `Notifications: KPI + Health`.
- **UAT:** casos por audiencia (docente, administrador, estudiante) con matriz esperada de evento-canal.
- **Criterios de aceptación:** WhatsApp bloqueado sin template aprobado, correo con preferencias aplicadas, trazabilidad completa de aprobación y entrega.
