# Plan por sprints: notificaciones de pendientes (docentes + administrativos)

Fecha: 2026-03-03  
Estado: En ejecución (Sprints 1-5 implementados; cierre documental final)

## 1) Objetivo
Implementar un sistema robusto y trazable de notificaciones de pendientes para docentes, con escalamiento a roles administrativos (`SUPERADMIN`, `ADMIN`, `COORDINATOR`), usando canal in-app + correo y ejecución periódica controlada.

## 2) Alcance confirmado
- Cobertura de destinatarios: docentes y administrativos.
- Horizonte: 5 sprints.
- Cadencia base: recordatorio diario hábil.
- Estrategia de scheduler en producción: migración progresiva a Celery Beat.

## 3) Estado actual (baseline)
- Existe comando de SLA de novedades: `notify_novelties_sla`.
- Existía brecha de ejecución periódica: el comando no estaba calendarizado en `backend_scheduler`.
- El proyecto tiene worker Celery activo, pero sin `beat_schedule` para este caso.

## 4) Implementación aplicada hoy (inicio Sprint 1)
### Cambios realizados
1. Se calendarizó `notify_novelties_sla` en `backend_scheduler` (`docker-compose.yml`) con:
   - `KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED=true`
   - `KAMPUS_NOVELTIES_SLA_DAYS=3`
   - `KAMPUS_NOVELTIES_SLA_NOTIFY_INTERVAL_SECONDS=86400`
2. Se agregó base de migración a Celery Beat en `backend/kampus_backend/settings.py`:
   - `CELERY_BEAT_SCHEDULE['notify-novelties-sla']`
   - Configuración por env:
     - `KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_MINUTE` (default: `0`)
     - `KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_HOUR` (default: `8`)
     - `KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_DAY_OF_WEEK` (default: `1-5`)
3. Se creó tarea Celery en `backend/novelties/tasks.py`:
   - `novelties.notify_novelties_sla`
   - Wrapper que ejecuta `call_command('notify_novelties_sla')`.

### Resultado
- El job pendiente ya corre en scheduler actual.
- Queda preparado el camino para activar Celery Beat sin reescribir lógica de negocio.

## 5) Plan detallado por sprint

## Sprint 1 — Cierre de brecha operativa + base técnica
Objetivo:
- Garantizar ejecución periódica del job pendiente y crear base de schedule en Celery.

Backlog:
- [x] Integrar `notify_novelties_sla` al loop de `backend_scheduler`.
- [x] Añadir variables de entorno para habilitar/deshabilitar y frecuencia.
- [x] Crear tarea Celery wrapper para el comando.
- [x] Definir `CELERY_BEAT_SCHEDULE` para el job en horario hábil.

Criterio de salida:
- Job ejecutándose diariamente en entorno dev/staging.
- Configuración parametrizable por variables de entorno.
- Sin errores de sintaxis/lint en archivos modificados.

## Sprint 2 — Escalamiento docente + políticas de destinatarios
Objetivo:
- Ampliar cobertura de reglas para pendientes docentes y escalamiento administrativo.

Backlog:
- [x] Definir matriz de destinatarios por tipo de pendiente.
- [x] Ajustar consultas de destinatarios por rol/sede/grupo.
- [x] Establecer umbrales de escalamiento (T+N días) por módulo.
- [x] Asegurar deduplicación por ventana temporal y contexto.

Avance implementado (2026-03-03):
- `notify_novelties_sla` ahora notifica a docente creador del caso (`NOVELTY_SLA_TEACHER`).
- Se agregó escalamiento a `SUPERADMIN/ADMIN` (`NOVELTY_SLA_ADMIN`) y `COORDINATOR` (`NOVELTY_SLA_COORDINATOR`) con umbrales independientes por variable de entorno.
- El targeting de destinatarios quedó acotado por alcance del caso: institución (rector/admin) y sede/grupo (coordinación de campus + director de grupo).
- Variables nuevas en scheduler: `KAMPUS_NOVELTIES_SLA_TEACHER_DAYS`, `KAMPUS_NOVELTIES_SLA_ESCALATE_ADMIN_DAYS`, `KAMPUS_NOVELTIES_SLA_ESCALATE_COORDINATOR_DAYS` y flags por rol.
- Pruebas focalizadas aprobadas: `novelties.tests.NoveltySlaNotificationsCommandTests`.

Criterio de salida:
- Reglas de destinatarios versionadas y probadas por casos clave.

## Sprint 3 — Plantillas y experiencia de notificación
Objetivo:
- Homogeneizar contenido de alertas con plantillas y contexto por tipo de pendiente.

Backlog:
- [x] Definir plantillas para pendientes docentes/administrativos.
- [x] Garantizar enlace de acción y enlace de respaldo.
- [x] Unificar categorías de envío para trazabilidad y métricas.
- [x] Validar pie legal en todos los correos notificados.

Avance implementado (2026-03-03):
- Se agregaron plantillas por defecto para `NOVELTY_SLA_TEACHER`, `NOVELTY_SLA_ADMIN`, `NOVELTY_SLA_COORDINATOR` y fallback genérico de notificaciones in-app.
- El canal de correo de notificaciones (`notifications.services`) ya usa `send_templated_email` con fallback resiliente a `send_email`.
- Se definió fallback automático a `/notifications` cuando una notificación no trae URL explícita, garantizando CTA y enlace de respaldo.
- Se validó categoría única `in-app-notification` y presencia de pie legal en los correos generados por notificaciones.
- Validación ejecutada con pruebas: `notifications.tests` y regresión `novelties.tests.NoveltySlaNotificationsCommandTests`.

Criterio de salida:
- Plantillas activas y probadas en preview + envío de prueba.

## Sprint 4 — Migración controlada a Celery Beat (producción)
Objetivo:
- Mover scheduling principal de loops a Celery Beat con rollback claro.

Backlog:
- [x] Activar servicio `celery beat` en despliegue objetivo.
- [x] Mantener compatibilidad temporal con scheduler loop durante transición.
- [x] Ejecutar pruebas de no duplicidad entre loop y beat.
- [x] Definir bandera de corte (`enable_loop` / `enable_beat`) por entorno.

Avance implementado (2026-03-04):
- Se agregó servicio `backend_beat` en `docker-compose.yml` y activación por flag `KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED`.
- Se introdujo conmutación explícita loop/beat por entorno:
  - `KAMPUS_NOVELTIES_SLA_LOOP_ENABLED` para scheduler loop.
  - `KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED` para `CELERY_BEAT_SCHEDULE` en `settings.py`.
- Se añadió ventana de deduplicación parametrizable `KAMPUS_NOVELTIES_SLA_DEDUPE_WITHIN_SECONDS` en `notify_novelties_sla` para minimizar riesgo de doble envío durante transición.
- En `docker-compose.prod.yml` se dejó configuración de corte productivo orientada a Beat (`loop=false`, `beat=true`) con horario hábil por variables.
- Validaciones ejecutadas:
  - `docker-compose config` y `python manage.py check` sin errores.
  - Pruebas focalizadas de regresión `novelties.tests.NoveltySlaNotificationsCommandTests` aprobadas.

Criterio de salida:
- Scheduler productivo operando en Beat sin duplicados ni huecos de ejecución.

## Sprint 5 — Observabilidad, SLA y hardening
Objetivo:
- Consolidar operación con métricas, alertas y runbook final.

Backlog:
- [x] KPIs: volumen, latencia, fallos, suppressions, ratio de apertura (si aplica).
- [x] Alarmas operativas de fallos reiterados.
- [x] Runbook de incidentes y verificación post-deploy.
- [x] Cierre de deuda técnica y estandarización final.

Avance implementado (2026-03-03):
- Se agregó comando `report_notifications_kpis` para métricas de ventana (`--hours`) en formato `text/json` sobre `Notification` y `EmailDelivery`.
- Se agregó comando `check_notifications_health` con umbrales por variable de entorno para `FAILED`, `SUPPRESSED` y tasa de éxito mínima; soporta fallo no-cero para integración con alertamiento.
- Se incorporó opción de notificación in-app a roles administrativos en brechas (`--notify-admins`) con dedupe por hora.
- Se documentó runbook operativo en `docs/guia_operacion_notificaciones_sla.md` con comandos, umbrales y flujo de respuesta.
- Se programó ejecución automática de `check_notifications_health` con flags de transición `loop/beat`:
  - loop en `backend_scheduler` (base/dev) con `KAMPUS_NOTIFICATIONS_HEALTH_LOOP_ENABLED`.
  - beat en `backend_beat` (prod override) con `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED`.
  - umbrales consolidados en `backend_worker` para ejecución de la tarea en Celery.

Criterio de salida:
- Operación estable con monitoreo, alertas y guía de respuesta.

## 6) Riesgos y mitigaciones
- Riesgo: doble envío durante transición loop + beat.  
  Mitigación: flags por entorno + dedupe_key diaria + ventana de deduplicación.

- Riesgo: ruido por sobre-notificación.  
  Mitigación: cadencia diaria hábil por defecto y umbrales configurables.

- Riesgo: desviación entre configuración env y DB de correo.  
  Mitigación: mantener trazabilidad en `EmailDelivery` y revisar `MailgunSettings` efectivos por entorno.

## 7) Validación mínima por release
- Ejecución manual del comando objetivo sin errores.
- Verificación de notificaciones creadas (in-app) y correo asociado cuando aplique.
- Confirmación de deduplicación efectiva en corridas consecutivas.
- Revisión de registros para casos sin destinatarios y casos exitosos.

## 8) Rollout / rollback
Rollout:
1. Activar en staging con cadencia diaria.
2. Validar 2-3 ciclos y trazabilidad.
3. Activar en producción en horario controlado.

Rollback:
1. Desactivar `KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED=false`.
2. Si aplica Beat, remover temporalmente entrada de schedule o deshabilitar beat.
3. Mantener comando manual operativo hasta estabilizar.

---
Documento base de ejecución para el frente de notificaciones de pendientes docentes/admin. Se actualizará al cierre de cada sprint con evidencias de cumplimiento.
