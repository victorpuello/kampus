# Diseño: Anotaciones automáticas del observador al cerrar comisión

Fecha: 2026-04-08

## Objetivo

Cuando una comisión de evaluación se cierre, el sistema debe generar anotaciones automáticas en el observador del estudiante con texto adaptativo y personalizado apoyado por IA.

## Reglas funcionales aprobadas

- Solo aplica para comisiones de tipo evaluación.
- La generación se ejecuta de forma asíncrona al cerrar la comisión.
- Para estudiantes con mejor desempeño académico se crea una anotación automática de tipo `PRAISE`.
- Para estudiantes con bajo rendimiento académico se crean dos anotaciones automáticas: una `ALERT` y una `COMMITMENT`.
- El texto debe ser personalizado y generado con IA, con fallback institucional si la IA no está disponible.
- Al finalizar el procesamiento:
  - el usuario que cerró la comisión recibe notificación interna;
  - los usuarios `SUPERADMIN` reciben notificación interna y correo.

## Criterios académicos

- La clasificación de estudiantes destacados y de bajo rendimiento reutiliza la misma lógica del acta grupal de comisión.
- Se extrae un helper común para evitar dos criterios distintos entre PDF y anotaciones automáticas.
- Para evitar mensajes contradictorios, un estudiante marcado con bajo rendimiento no recibe felicitación automática aunque aparezca alto en el ranking bruto.

## Arquitectura

1. `POST /api/commissions/{id}/close/` cambia el estado a `CLOSED`.
2. Si la comisión es de evaluación, el cierre encola una tarea Celery.
3. La tarea ejecuta un servicio de dominio que:
   - clasifica estudiantes;
   - genera textos con IA;
   - aplica fallback cuando sea necesario;
   - crea o actualiza anotaciones por `rule_key`;
   - consolida un resumen final.
4. La tarea usa ese resumen para notificar al usuario que cerró y a los `SUPERADMIN`.

## Idempotencia

- Cada anotación automática usa `rule_key` por comisión, tipo y estudiante:
  - `COMMISSION_CLOSE:{commission_id}:PRAISE:{student_id}`
  - `COMMISSION_CLOSE:{commission_id}:ALERT:{student_id}`
  - `COMMISSION_CLOSE:{commission_id}:COMMITMENT:{student_id}`
- Si la tarea se reintenta, las anotaciones se actualizan y no se duplican.
- Las notificaciones también usan claves de deduplicación para evitar spam en reintentos.

## Contenido IA

- Se agrega un método nuevo en `academic.ai.AIService` para redactar la anotación del observador.
- El prompt usa contexto controlado: estudiante, periodo, grupo, promedio, fortalezas o asignaturas reprobadas según el caso.
- Los compromisos del tipo `COMMITMENT` reutilizan el generador existente de compromisos diferenciados.

## Manejo de errores

- Falla de IA: se crea la anotación con texto institucional por defecto.
- Falla en una anotación individual: se registra y el proceso continúa con los demás estudiantes.
- Falla de notificación o correo: no revierte anotaciones ya creadas.

## Limpieza

- Al eliminar una comisión, también se eliminan las anotaciones automáticas generadas por este flujo mediante el prefijo `COMMISSION_CLOSE:{commission_id}:`.

## Pruebas previstas

- El cierre de comisión encola la tarea asíncrona.
- La tarea crea `PRAISE`, `ALERT` y `COMMITMENT` según corresponda.
- La tarea es idempotente en reintentos.
- Solo `SUPERADMIN` recibe notificación interna y correo administrativo.
- El usuario que cerró la comisión recibe notificación interna.
- El borrado de la comisión remueve las anotaciones automáticas asociadas.