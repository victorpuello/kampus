# Plan de implementación: Planilla Preescolar Cualitativa (SIEE 2026)

Guía operativa (configuración y uso): ver [docs/guia_planilla_preescolar_cualitativa_operacion.md](docs/guia_planilla_preescolar_cualitativa_operacion.md)

## Objetivo
Implementar una planilla de notas **exclusiva para preescolar** con calificación **cualitativa** (sin números visibles), basada en una escala institucional SIEE configurada para el **año 2026**.

- La UI será **separada** de la planilla numérica actual.
- La UI será **visible solo para docentes** que tengan asignaciones en **grupos de preescolar**.
- El backend también debe **restringir acceso** (no basta con ocultar la UI).
- Se aplican **exactamente las mismas reglas** de edición/bloqueo actuales: periodo actual, `grades_edit_until`, `is_closed`, y Edit Requests/Grants FULL/PARTIAL.

## Decisiones cerradas
### 1) Columnas de la planilla (qué se califica)
- Columnas = **Logros planificados del periodo** (`Achievement`) usados como indicadores observables.
- Agrupación visual = por **Dimensión** (`Dimension`).

### 2) Escala cualitativa (SIEE) como etiquetas
- Se usa un `EvaluationScale` de tipo `QUALITATIVE` específico para **PREESCOLAR** por **Año** (2026), no por periodo.
- Escala Preescolar 2026 (3 niveles):
  1. Avanza con seguridad
  2. En proceso
  3. Requiere acompañamiento intensivo

**Regla de selección:** `academic_year=2026` + `applies_to_level=PRESCHOOL` + `is_default=true` (o única activa).

### 3) Persistencia (sin números visibles)
- La calificación visible es cualitativa.
- Se permite un **equivalente numérico interno** opcional solo para compatibilidad técnica (filtros/estadísticas), **sin promedios** ni reglas de promoción basadas en decimales.

### 4) Reglas de bloqueo
- Se aplican **idénticas** a la planilla actual:
  - Solo periodo actual
  - Respeta `period.is_closed`
  - Respeta `grades_edit_until`
  - Respeta Edit Requests/Grants (FULL/PARTIAL) + bloqueo por celdas

## Alcance / No alcance
### En alcance
- Backend: soporte de modo cualitativo + endpoints preescolar.
- Frontend: pantalla nueva de planilla preescolar con selector de etiquetas.
- Permisos estrictos: solo docentes de preescolar.
- Tests de permisos y de bloqueos clave.

### Fuera de alcance (por ahora)
- Boletines/PDF de preescolar (se planeará en un sprint posterior si se requiere).
- Cambios a la planilla numérica existente.
- Cálculo de promedios/definitivas numéricas para preescolar.

---

## Sprint 0 — Diseño técnico (contratos y criterios)
**Meta:** dejar el diseño “cerrado” antes de tocar producción.

- [x] Definir el criterio de “grupo preescolar” (derivado de `Group.grade.level.level_type == PRESCHOOL`).
- [x] Definir cómo se filtran los `Achievement` del periodo para construir columnas (por `teacher_assignment`, `group`, `period`).
- [x] Definir contrato JSON de los endpoints (API real):
  - [x] `GET /api/preschool-gradebook/available/?period=<id>` (listar planillas disponibles)
  - [x] `GET /api/preschool-gradebook/gradebook/?teacher_assignment=<id>&period=<id>` (abrir gradebook)
  - [x] `POST /api/preschool-gradebook/bulk-upsert/` (guardar celdas)
  - [x] `GET /api/preschool-gradebook/labels/?academic_year=<id>` o `...?period=<id>` (catálogo SIEE cualitativo)
- [x] Definir UX mínima (pantalla): filtros, tabla, guardado, estado de bloqueos.

---

## Sprint 1 — Backend base (modelo + migraciones)
**Meta:** soportar `QUALITATIVE` y guardar descriptor cualitativo por celda.

- [x] Agregar `GRADING_MODE_QUALITATIVE` a `GradeSheet.grading_mode`.
- [x] Agregar a `EvaluationScale` los metadatos de selección para preescolar:
  - [x] `applies_to_level` (ej. `PRESCHOOL`)
  - [x] `is_default` (para elección automática)
  - [x] `order` (para ordenar etiquetas cualitativas)
  - [x] `internal_numeric_value` (opcional)
- [x] Extender `AchievementGrade` para guardar el descriptor cualitativo:
  - [x] `qualitative_scale` (FK nullable a `EvaluationScale`)
- [x] Crear migración Django para estos cambios.

Criterios de aceptación (Sprint 1):
- [x] Migraciones aplican sin errores.
- [x] Se pueden crear registros `EvaluationScale(QUALITATIVE)` con etiquetas ordenadas.

---

## Sprint 2 — Backend API preescolar (open/list/save) + permisos
**Meta:** endpoints preescolar listos, con el mismo sistema de bloqueos.

- [x] Crear serializers (nombres reales):
  - [x] `PreschoolGradebookLabelSerializer` (labels)
  - [x] `PreschoolGradebookBulkUpsertSerializer` (save)
- [x] Implementar endpoints (reales):
  - [x] `GET /api/preschool-gradebook/available/?period=<id>`
  - [x] `GET /api/preschool-gradebook/gradebook/?teacher_assignment=<id>&period=<id>`
  - [x] `POST /api/preschool-gradebook/bulk-upsert/`
  - [x] `GET /api/preschool-gradebook/labels/?academic_year=<id>` o `...?period=<id>`
- [x] Implementar permisos estrictos:
  - [x] Solo `TEACHER` con asignaciones en grupos preescolar (403 para otros)
- [x] Reusar las mismas validaciones de bloqueo:
  - [x] periodo actual
  - [x] `period.is_closed`
  - [x] `grades_edit_until`
  - [x] grants FULL/PARTIAL (FULL = todo; PARTIAL = por matrícula)

Criterios de aceptación (Sprint 2):
- [x] Un docente preescolar puede abrir y ver su planilla (vacía o con datos).
- [x] Un docente no-preescolar recibe 403.
- [x] Se retorna el catálogo de etiquetas SIEE (según configuración del año).

---

## Sprint 3 — Frontend: UI nueva (solo docentes preescolar)
**Meta:** pantalla preescolar separada con selector cualitativo por celda.

- [x] Agregar métodos a `academicApi` (nombres reales):
  - [x] `listAvailablePreschoolGradeSheets`
  - [x] `getPreschoolGradebook`
  - [x] `bulkUpsertPreschoolGradebook`
  - [x] `listPreschoolLabels`
- [x] Crear página nueva: `kampus_frontend/src/pages/PreschoolGrades.tsx`.
- [x] Render de tabla:
  - [x] filas = estudiantes
  - [x] columnas = logros del periodo (con dimensión visible)
  - [x] celda = select con etiquetas
- [x] UX de guardado:
  - [x] guardado bulk (botón)
  - [x] estados loading/error/toast
- [x] Visibilidad:
  - [x] En el menú/rutas, mostrar solo si el usuario es `TEACHER` y se detectan asignaciones preescolar.
  - [ ] Si accede por URL directa sin permiso, mostrar “No autorizado”.

Criterios de aceptación (Sprint 3):
- [x] Docente preescolar ve la pantalla y puede seleccionar etiquetas.
- [x] Docente no-preescolar no ve el acceso.

---

## Sprint 4 — End-to-end + bloqueos y grants
**Meta:** igualar la experiencia de bloqueo a la planilla numérica.

- [ ] Bloquear edición cuando:
  - [ ] el periodo no es actual
  - [ ] `is_closed=true`
  - [ ] venció `grades_edit_until`
- [ ] Permitir edición posterior a la fecha solo con Grant FULL/PARTIAL.
- [ ] Implementar bloqueo por celda (cuando el grant es parcial) y reflejarlo en la UI.

Criterios de aceptación (Sprint 4):
- [ ] Reglas de bloqueo se comportan igual que en `/grades`.

---

## Sprint 5 — Tests + documentación
**Meta:** asegurar calidad y no regresión.

- [ ] Tests backend (APITestCase):
  - [ ] permisos (preescolar vs no-preescolar)
  - [ ] bloqueo por `is_closed`/`grades_edit_until`
  - [ ] grants parciales
- [ ] Documentar operación:
  - [ ] cómo configurar la escala preescolar 2026
  - [ ] cómo el docente accede a la planilla

---

## Definition of Done (DoD)
- [ ] UI preescolar solo visible para docentes con grupos preescolar.
- [ ] Backend bloquea cualquier acceso no autorizado.
- [ ] Planilla preescolar permite calificar logros con etiquetas SIEE (sin números visibles).
- [ ] Bloqueos y grants se comportan igual que en la planilla numérica.
- [ ] Tests cubren permisos y bloqueos clave.
