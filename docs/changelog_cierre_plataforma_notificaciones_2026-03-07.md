# Changelog de cierre — Plataforma de notificaciones

Fecha: 2026-03-07  
Estado: Cerrado

## Resumen
Se cierra la implementación de la plataforma robusta de notificaciones con gobernanza WhatsApp, endurecimiento de políticas de envío, auditoría SLA, observabilidad operativa y validación técnica final.

## Cambios clave
- Flujo formal de aprobación de templates WhatsApp con estados `draft/submitted/approved/rejected`.
- Restricción de aprobación a `SuperAdmin` y acciones de submit/approve/reject en API y UI.
- Política estricta de envío WhatsApp: solo usa mappings aprobados para notificaciones.
- Persistencia de umbrales SLA de templates WhatsApp por ambiente.
- Auditoría SLA dedicada (lista + export CSV) para cambios de umbrales.
- Consola de sistema ampliada con filtros de aprobación, acciones de flujo, historial y exportes.
- Cobertura de observabilidad y salud operacional consolidada con comandos KPI/Health.

## Bloqueadores cerrados
- Test E2E de webhook WhatsApp corregido en setup de pruebas para firma estricta.
- Drift de migraciones resuelto con migración de rename de índices en `communications`.

## Evidencia de validación
- Backend
  - `notifications.tests.NotificationObservabilityCommandsTests` ✅
  - `novelties.tests.NoveltySlaNotificationsCommandTests` ✅
  - `communications.tests.WhatsAppTemplateAndHealthAdminTests` ✅
  - `communications.tests.WhatsAppNotificationE2ETests.test_notification_task_and_webhook_updates_delivery` ✅
- Frontend
  - `npm run lint` en `kampus_frontend` ✅
- Migraciones
  - `python manage.py makemigrations --check --dry-run` ✅
- Operación
  - Tarea `Notifications: KPI + Health` ejecutada sin breach crítico bloqueante ✅

## Artefactos relevantes
- Plan final de cierre: [docs/plan_plataforma_robusta_notificaciones_2026.md](docs/plan_plataforma_robusta_notificaciones_2026.md)
- Migración de cierre: [backend/communications/migrations/0029_rename_communicatio_approva_becfe2_idx_communicati_approva_b0e43a_idx_and_more.py](backend/communications/migrations/0029_rename_communicatio_approva_becfe2_idx_communicati_approva_b0e43a_idx_and_more.py)
- Prueba E2E corregida: [backend/communications/tests.py](backend/communications/tests.py)

## Resultado
Se declara cierre técnico y funcional del plan de plataforma robusta de notificaciones para el alcance definido en sprints 0–6.
