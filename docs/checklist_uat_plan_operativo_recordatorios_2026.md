# Checklist UAT — Plan operativo + recordatorios (2026)

Estado: **APROBADO**  
Fecha de cierre: **2026-03-07**

## Perfil: Admin / SuperAdmin

- [x] Puede ingresar a `/operations/plan-activities`.
- [x] Puede crear actividad con múltiples responsables.
- [x] Puede editar actividad existente.
- [x] Puede eliminar actividad.
- [x] Ve estado de mapeo (`Mapeado` / `Sin mapear`) en tabla.
- [x] Puede ejecutar “Reprocesar responsables automáticamente”.
- [x] Ve widget de actividades próximas en dashboard.

## Perfil: Docente

- [x] No tiene acceso de administración CRUD del plan operativo.
- [x] Ve widget “Actividades plan operativo” en dashboard.
- [x] Visualiza fecha, actividad, responsables y días faltantes.

## Recordatorios y scheduler

- [x] Job manual `notify_operational_plan_activities` ejecuta sin error.
- [x] Genera recordatorios para hitos d7/d3/d1.
- [x] Re-ejecutar job en misma ventana no duplica recordatorios (dedupe).
- [x] Tipo `OPERATIONAL_PLAN_REMINDER` disponible y activo.

## Calidad técnica

- [x] Backend tests POA:
  - `notifications.tests.OperationalPlanActivityApiTests`
  - `notifications.tests.OperationalPlanReminderCommandTests`
- [x] Frontend lint:
  - `cd kampus_frontend && npm run lint`

## Criterio de aceptación final

- [x] CRUD admin operativo.
- [x] Widget dashboard operativo (admin/docente).
- [x] Recordatorios d7/d3/d1 operativos sin duplicados.
- [x] Flujo operativo documentado (runbook).
