# Plan: Actividades Plan Operativo + Recordatorios (2026)

Estado: **CERRADO (100%)**  
Última actualización: **2026-03-07**

Este documento centraliza el plan que pediste para calendario operativo institucional con CRUD admin, widget de dashboard y recordatorios multicanal (in-app, email, WhatsApp) a **7/3/1 días**.

## Resumen ejecutivo

- Ámbito: institucional único.
- Responsables: múltiples usuarios del sistema.
- Recordatorios: 3 hitos (d7, d3, d1).
- Canales: in-app + email + WhatsApp.
- Cumplimiento: marcación manual de actividades completadas/no completadas.
- Trazabilidad: exportación PDF institucional con resumen y detalle de cumplimiento.
- Estrategia técnica: reutilización de outbox/dedupe/retries y jobs existentes.

## Estado por paso (tu plan original)

1) **Dominio POA backend** ✅
- Implementado modelo `OperationalPlanActivity` con M2M responsables, auditoría e índices.
- Archivo: `backend/notifications/models.py`.

2) **Migraciones + serializer/viewset/urls** ✅
- CRUD completo + endpoint `upcoming` + permisos admin/superadmin.
- Archivos:
  - `backend/notifications/migrations/0006_operationalplanactivity.py`
  - `backend/notifications/migrations/0007_rename_notificatio_is_acti_5fb763_idx_notificatio_is_acti_a4128b_idx_and_more.py`
  - `backend/notifications/serializers.py`
  - `backend/notifications/views.py`
  - `backend/notifications/urls.py`

3) **Scheduler notify_operational_plan_activities** ✅
- Comando implementado con ventanas d7/d3/d1.
- Archivo: `backend/notifications/management/commands/notify_operational_plan_activities.py`.

4) **Dedupe/idempotencia + NotificationType** ✅
- Dedupe por actividad/usuario/hito en job (evita duplicados al re-ejecutar).
- NotificationType específico para recordatorios operativos.
- Archivos:
  - `backend/notifications/management/commands/notify_operational_plan_activities.py`
  - `backend/notifications/models.py`

5) **Jobs en settings + consola operativa** ✅
- Job integrado para ejecución periódica y operación manual por comando/tarea.
- Archivo principal: `backend/kampus_backend/settings.py`.

6) **Servicio frontend tipado** ✅
- Servicio CRUD/upcoming/map-responsibles implementado y tipado.
- Archivo: `kampus_frontend/src/services/operationalPlan.ts`.

7) **UI admin Actividades plan operativo** ✅
- Pantalla CRUD funcional con tabla/formulario y opción de reproceso de mapeo.
- Incluye estado de mapeo (Mapeado / Sin mapear) y texto original cuando aplica.
- Archivo: `kampus_frontend/src/pages/OperationalPlanActivities.tsx`.

8) **Widget dashboard docente/admin** ✅
- Widget de próximas actividades visible en dashboard.
- Archivo: `kampus_frontend/src/pages/DashboardHome.tsx`.

9) **Resumen backend para dashboard por rol** ✅
- Se cierra con endpoint dedicado `upcoming` (decisión técnica aplicada para mantener simplicidad y bajo acoplamiento).

10) **Pruebas (backend/UI) y casos especiales** ✅
- Suite dedicada implementada para API POA y scheduler (timezone `America/Bogota`, edición post-notificación y dedupe).
- Frontend lint validado.

11) **Documentación operativa + UAT** ✅
- Runbook operativo y checklist UAT por rol cerrados.
- Documentos:
  - `docs/runbook_plan_operativo_recordatorios_2026.md`
  - `docs/checklist_uat_plan_operativo_recordatorios_2026.md`

12) **Trazabilidad de cumplimiento + PDF institucional** ✅
- Estado manual por actividad (`Completada` / `No completada`) con actor, fecha y nota.
- Widgets superiores en UI POA (total, completadas, no completadas, % cumplimiento).
- Descarga de reporte en PDF con membrete institucional y trazabilidad por actividad.
- Archivos:
  - `backend/notifications/models.py`
  - `backend/notifications/views.py`
  - `backend/notifications/templates/notifications/reports/operational_plan_compliance_pdf.html`
  - `kampus_frontend/src/pages/OperationalPlanActivities.tsx`
  - `kampus_frontend/src/services/operationalPlan.ts`

## Artefactos adicionales ya implementados

- Importación masiva desde markdown:
  - `backend/notifications/management/commands/import_operational_plan_markdown.py`
  - Fuente usada: `backend/plan_operativo_2026.md` (copia en `docs/plan_operativo_2026.md`).
- Mapeo automático de responsables texto → usuarios:
  - `backend/notifications/management/commands/map_operational_plan_responsibles.py`
  - Acción API para dispararlo desde UI: `map-responsibles` en `backend/notifications/views.py`.

## Cómo entrar rápido a la funcionalidad

- Ruta admin POA: `/operations/plan-activities`
- Menú: Operaciones → Plan operativo.
- Dashboard: tarjeta “Actividades plan operativo”.

## Verificación rápida (operativa)

1. Frontend lint:
   - `cd kampus_frontend && npm run lint`
2. Ejecutar job manual:
   - `docker compose exec -T backend python manage.py notify_operational_plan_activities`
3. KPI + health:
   - tarea VS Code `Notifications: KPI + Health`.

## Evidencia de cierre

- Backend tests POA aprobados:
  - `notifications.tests.OperationalPlanActivityApiTests`
  - `notifications.tests.OperationalPlanReminderCommandTests`
- Evidencia de cumplimiento POA aprobada:
  - `summary` de cumplimiento operativo.
  - `mark-completed` / `mark-pending` operativo.
  - `compliance-report-pdf` operativo con membrete institucional.
- Frontend lint aprobado:
  - `cd kampus_frontend && npm run lint`
- Job manual validado sin duplicados en misma ventana:
  - `notify_operational_plan_activities`
- Runbook y UAT disponibles en docs.
