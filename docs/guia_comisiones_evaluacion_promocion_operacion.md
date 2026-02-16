# Guía operativa y técnica: Comisiones de Evaluación y Promoción

Esta guía resume cómo operar el módulo de comisiones en Kampus y cómo mantenerlo técnicamente.

## 1) Alcance funcional

El módulo permite:
- Crear comisiones de **evaluación** por periodo.
- Crear comisiones de **promoción** al cierre anual.
- Calcular estudiantes en dificultad según regla configurable.
- Generar actas de compromiso (sincrónico y asíncrono).
- Registrar evento en observador y notificar al director de grupo.

## 2) Roles y permisos

Operación habilitada para:
- `ADMIN`
- `SUPERADMIN`
- `COORDINATOR`

Operación denegada para roles sin coordinación académica (ej. `TEACHER` para crear/gestionar comisiones).

## 3) Flujo operativo recomendado

### Paso 1 — Crear comisión

Ruta UI:
- Menú académico → `Comisiones`

Datos mínimos:
- Tipo (`EVALUATION` o `PROMOTION`)
- Año académico
- Periodo (obligatorio para `EVALUATION`)
- Grupo (opcional)

Regla del título:
- Se genera automáticamente en backend y frontend con el patrón:
- `Comisión_{PERIODO}_{GRADO}_{GRUPO}_{ANIO}`

### Paso 2 — Recalcular dificultades (estado `DRAFT`)

Acción UI:
- Botón `Recalcular`

Resultado:
- Actualiza/crea decisiones por estudiante.
- Retorna resumen agregado:
  - total estudiantes
  - total en riesgo
  - total sin riesgo
  - porcentaje en riesgo
  - distribución por materias y áreas perdidas

### Paso 3 — Iniciar comisión (`DRAFT` → `IN_PROGRESS`)

Acción UI:
- Botón `Iniciar`

Efecto:
- Habilita generación de actas y acciones de cierre.

### Paso 4 — Generar actas

Opciones:
- **Individual** por estudiante (botón `Generar acta`).
- **Masiva asíncrona** (botón `Actas async`, solo estudiantes en riesgo por defecto).

Efectos automáticos:
- Crea/actualiza `CommitmentActa`.
- Registra anotación en observador con `rule_key` idempotente.
- Envía notificación al director de grupo.

### Paso 5 — Seguimiento y descarga

- UI muestra estado de jobs asíncronos (pendiente, en proceso, completado, fallido).
- Descarga de PDF habilitada cuando el job está en `SUCCEEDED`.

### Paso 6 — Cerrar comisión (`IN_PROGRESS` → `CLOSED`)

Acción UI:
- Botón `Cerrar`

Efecto:
- Bloquea acciones que no corresponden al estado cerrado.

## 4) Estados y reglas de transición

Estados:
- `DRAFT`
- `IN_PROGRESS`
- `CLOSED`

Transiciones válidas:
- `DRAFT` → `IN_PROGRESS`
- `IN_PROGRESS` → `CLOSED`

Reglas clave:
- `refresh-difficulties` solo en `DRAFT`.
- `generate-acta` y `generate-actas-async` solo en `IN_PROGRESS`.
- Cierre permitido únicamente desde `IN_PROGRESS`.

## 5) Endpoints principales (API)

Base: `/api/`

- `GET|POST /commissions/`
- `POST /commissions/{id}/refresh-difficulties/`
- `GET /commissions/{id}/preview-difficulties/`
- `POST /commissions/{id}/start/`
- `POST /commissions/{id}/close/`
- `POST /commissions/{id}/generate-actas-async/`
- `GET|PUT /commission-decisions/`
- `POST /commission-decisions/{id}/generate-acta/`
- `GET /commission-decisions/{id}/acta/?format=pdf`

## 6) Integración con reportes asíncronos

Se reutiliza `ReportJob` con tipo:
- `ACADEMIC_COMMISSION_ACTA`

Comportamiento:
- Cola y generación de PDF en worker.
- Descarga autenticada al finalizar.
- Mismo patrón de polling y manejo de estado usado en otros reportes del sistema.

## 7) Integración con observador

Al generar acta se crea una anotación tipo `COMMITMENT` en observador.

Idempotencia:
- Se usa `rule_key` con patrón:
- `COMMISSION_ACTA:{commission_id}:{decision_id}`

En UI:
- Desde comisiones, botón `Observador` abre el estudiante en pestaña de anotaciones (`tab=observer_annotations`).

## 8) Casos borde cubiertos

Cobertura incluida en pruebas:
- Comisión evaluación sin periodo devuelve lista vacía.
- Sin notas/asignaciones: estudiantes permanecen con conteo 0/0 (no en riesgo).
- Matrículas no activas (`RETIRED`) no se incluyen en cálculos de promoción.

## 9) Operación en Docker/local

### Docker

Si hay errores tipo `500` por tabla inexistente:
- Aplicar migraciones en el contenedor backend activo.
- Verificar que frontend apunta al backend correcto.

### Local

- `python backend/manage.py migrate`
- `python backend/manage.py runserver`

## 10) Validaciones recomendadas antes de salida

- Ejecutar pruebas del módulo:
- `python backend/manage.py test academic.test_commissions`

- Ejecutar lint frontend en archivos de comisiones:
- `cd kampus_frontend && npm run lint -- src/pages/CommissionsWorkflow.tsx src/services/academic.ts`

## 11) Troubleshooting rápido

- No puedo generar acta:
  - Verificar que la comisión esté en `IN_PROGRESS`.

- No aparece botón/acción habilitada:
  - Validar estado de comisión y rol del usuario.

- Error al descargar PDF:
  - Revisar estado del job (`FAILED`, `error_message`) y logs del worker.

- No veo el evento en observador:
  - Confirmar generación de acta y abrir estudiante en pestaña de anotaciones.

## 12) Referencias internas

- Plan del módulo:
  - `docs/plan_comisiones_evaluacion_promocion_2026.md`

- Flujo de reportes async:
  - `docs/guia_reportes_pdf_async_jobs.md`

- Implementación backend:
  - `backend/academic/commission_views.py`
  - `backend/academic/commission_services.py`
  - `backend/academic/commission_serializers.py`

- Implementación frontend:
  - `kampus_frontend/src/pages/CommissionsWorkflow.tsx`
  - `kampus_frontend/src/services/academic.ts`
