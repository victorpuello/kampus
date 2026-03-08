# Runbook operativo — Plan operativo y recordatorios (2026)

Estado: **ACTIVO**  
Última actualización: **2026-03-07**

## Alcance

Este runbook cubre la operación del módulo de actividades del plan operativo institucional:
- CRUD admin de actividades.
- Widget de próximas actividades en dashboard.
- Seguimiento de cumplimiento manual (completada/no completada).
- Widgets de cumplimiento (total, completadas, no completadas, %).
- Exportación de reporte PDF institucional de cumplimiento.
- Recordatorios automáticos en ventanas **d7/d3/d1**.
- Canales: in-app, email y WhatsApp (según configuración de tipo/canal).

## Rutas y componentes

- UI admin: `/operations/plan-activities`
- Widget dashboard: `DashboardHome` → tarjeta “Actividades plan operativo”
- API base: `/api/notifications/operational-plan-activities/`
- API cumplimiento: `/summary/`, `/<id>/mark-completed/`, `/<id>/mark-pending/`
- API reporte: `/compliance-report-pdf/`
- Job manual: `notify_operational_plan_activities`

## Operación diaria

1. Verificar actividades próximas en dashboard (docente/admin).
2. Revisar widgets de cumplimiento en UI admin POA.
3. Marcar cumplimiento manual de actividades (completada/no completada) cuando aplique.
4. Descargar reporte PDF de cumplimiento para trazabilidad institucional.
5. Ejecutar KPI/Health de notificaciones:
   - Tarea VS Code: `Notifications: KPI + Health`

## Operación semanal

1. Confirmar que el scheduler de recordatorios esté habilitado por entorno.
2. Ejecutar job manual de prueba controlada:
   - `docker compose exec -T backend python manage.py notify_operational_plan_activities`
3. Validar que no se duplican notificaciones al re-ejecutar (dedupe por `operational-plan:{activity_id}:d{offset}`).

## Alta masiva de actividades

1. Cargar/actualizar fuente markdown:
   - `backend/plan_operativo_2026.md`
2. Importar actividades:
   - `docker compose exec -T backend python manage.py import_operational_plan_markdown --file backend/plan_operativo_2026.md --year 2026 --replace`
3. Mapear responsables texto → usuarios:
   - UI: botón “Reprocesar responsables automáticamente”
   - o CLI: `docker compose exec -T backend python manage.py map_operational_plan_responsibles --replace-existing`

## Troubleshooting rápido

### 1) No aparecen actividades en widget
- Verificar que existan actividades activas y con fecha en ventana consultada.
- Probar endpoint: `/api/notifications/operational-plan-activities/upcoming/?days=30&limit=5`.

### 2) Recordatorios no salen
- Ejecutar manualmente `notify_operational_plan_activities` y revisar salida.
- Confirmar que usuarios objetivo estén activos.
- Revisar configuración de canales en tipos de notificación.

### 3) Responsables sin mapear
- Revisar columna “Mapeo” en UI admin.
- Ejecutar reproceso y corregir casos residuales manualmente.

### 4) No cambia estado de cumplimiento
- Confirmar perfil con permisos admin/superadmin.
- Reintentar acción en UI (`Marcar cumplida` / `Marcar pendiente`) y validar respuesta API.

### 5) No genera PDF de cumplimiento
- Verificar dependencias de WeasyPrint en el entorno.
- Confirmar acceso a `/api/notifications/operational-plan-activities/compliance-report-pdf/`.
- Validar que exista configuración institucional para membrete si se espera encabezado gráfico.

## Evidencia mínima de operación

- Job manual ejecutado sin error.
- KPI/Health diario ejecutado.
- Actividades próximas visibles en dashboard.
- Estado de cumplimiento actualizado en UI y persistido por actividad.
- PDF institucional de cumplimiento descargable.
- Sin duplicados de recordatorio al re-run del job en misma ventana.
