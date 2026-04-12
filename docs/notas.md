# Informe Técnico: Sistema de Calificaciones — Kampus

**Fecha de análisis:** Abril 2026  
**Versión del sistema:** Monorepo Django REST + React/TypeScript (Vite)  
**Alcance:** Flujo completo de notas, desde la ingreso del docente hasta boletines, sábana y comisión de evaluación/promoción.

---

## 1. Visión general del flujo

```
Configuración institucional
  └─ AcademicYear → Period(s)
  └─ Grade → AcademicLoad(s) → Subject → Area
  └─ TeacherAssignment (docente + academic_load + grupo + año)
  └─ Dimension (porcentaje ponderado, p. ej. Cognitivo 40%, Procedimental 35%, Actitudinal 25%)
  └─ Achievement (logro por academic_load + period ± group, con % y Dimension)

Ingreso de notas (docente)
  └─ GradeSheet (planilla) → AchievementGrade (nota por logro × matrícula)
       └─ Modo ACTIVITIES → AchievementActivityColumn + AchievementActivityGrade → promedio → AchievementGrade
       └─ Modo QUALITATIVE (Preescolar) → AchievementGrade.qualitative_scale (EvaluationScale cualitativa)

Cálculo de definitiva (en memoria, no persistida por periodo)
  └─ final_grade_from_achievement_scores() en academic/grading.py
       → promedio ponderado por Dimension → nota definitiva de asignatura por periodo

Nota anual de asignatura
  └─ Promedio de las notas definitivas de cada periodo
  └─ compute_promotions_for_year() en academic/promotion.py

Reportes
  ├─ Boletín individual → build_academic_period_report_context()  [students/academic_period_report.py]
  ├─ Sábana de notas   → build_academic_period_sabana_context()  [students/academic_period_sabana_report.py]
  └─ Comisión          → commission_services.py / promotion.py
```

---

## 2. Modelos de datos clave

### 2.1 Estructura jerárquica académica

| Modelo | Tabla | Propósito |
|---|---|---|
| `AcademicYear` | `academic_academicyear` | Año lectivo (PLANNING / ACTIVE / CLOSED) |
| `Period` | `academic_period` | Periodo académico (P1–P4). Tiene `grades_edit_until` para controlar la ventana de edición |
| `Grade` | `academic_grade` | Grado escolar (con `ordinal` −2…11) |
| `AcademicLevel` | `academic_academiclevel` | Nivel: PRESCHOOL, PRIMARY, SECONDARY, MEDIA |
| `Group` | `academic_group` | Grupo (ej. "10-1") dentro de un grado/año |
| `Area` | `academic_area` | Área curricular (Matemáticas, Ciencias, etc.) |
| `Subject` | `academic_subject` | Asignatura (pertenece a un Área) |
| `AcademicLoad` | `academic_academicload` | Asignatura en un grado con horas/semana y `weight_percentage` |
| `TeacherAssignment` | `academic_teacherassignment` | Docente asignado a academic_load + grupo + año (único por combinación) |

### 2.2 Estructura de evaluación

| Modelo | Propósito |
|---|---|
| `Dimension` | Dimensión de evaluación (Cognitivo, Procedimental, Actitudinal). Tiene `percentage` que define su peso en la nota definitiva. Pertenece a un `AcademicYear`. |
| `Achievement` | Logro planificado: instancia de evaluación para un academic_load + period. Puede ser global (group=NULL) o específico de un grupo. Tiene `percentage` (peso dentro de la dimensión) y FK a `Dimension`. |
| `AchievementDefinition` | Banco de logros reutilizable. |
| `EvaluationScale` | Escala de valoración (ej. Superior: 4.6–5.0). Puede ser NUMERIC (bachillerato) o QUALITATIVE (preescolar). |
| `EvaluationComponent` / `Assessment` / `StudentGrade` | Modelos legados de componentes de evaluación (actualmente reemplazados por el sistema de logros/dimensiones en el flujo principal). |

### 2.3 Modelos de calificación operativa

| Modelo | Tabla | Propósito |
|---|---|---|
| `GradeSheet` | `academic_gradesheet` | Planilla de calificaciones. Una por (TeacherAssignment × Period). Estados: DRAFT / PUBLISHED. Tiene `grading_mode` (ACHIEVEMENT, ACTIVITIES, QUALITATIVE). |
| `AchievementGrade` | `academic_achievementgrade` | **Celda central de la planilla.** Nota de un estudiante (Enrollment) en un logro (Achievement) dentro de una planilla. `score` en escala 1.00–5.00; `qualitative_scale` para preescolar. |
| `AchievementActivityColumn` | `academic_achievementactivitycolumn` | Columna de actividad definida por el docente para un logro en una planilla (modo ACTIVITIES). |
| `AchievementActivityGrade` | `academic_achievementactivitygrade` | Nota de una actividad (Column × Enrollment). Se promedia para calcular la nota del logro. |

### 2.4 Modelos de control de edición

| Modelo | Propósito |
|---|---|
| `EditRequest` | Solicitud del docente para editar planillas/planeación fuera de la ventana. Puede ser FULL o PARTIAL (por estudiante). |
| `EditGrant` | Permiso otorgado por coordinador/admin. Tiene `valid_until` para crono-limitar el permiso. |
| `EditGrantItem` | Para grants parciales, especifica las matrículas (Enrollment) autorizadas. |

---

## 3. ¿Cómo ingresa el docente las notas?

### 3.1 Flujo de acceso

1. El docente autenticado accede al frontend en `/grades?period=<id>&ta=<id>`.
2. El frontend consulta `GET /api/academic/grade-sheets/gradebook/?teacher_assignment=<id>&period=<id>`.
3. El backend verifica:
   - Que el `TeacherAssignment` pertenece al docente.
   - Que el periodo esté activo (no futuro ni pasado de la ventana `grades_edit_until`).
4. Si no existe `GradeSheet`, se crea automáticamente en modo `ACHIEVEMENT`.
5. El endpoint devuelve el payload completo:
   ```json
   {
     "gradesheet": {...},
     "dimensions": [...],
     "achievements": [{"id": 1, "description": "...", "dimension": 3, "percentage": 50}],
     "students": [{"enrollment_id": 12, "student_name": "..."}],
     "cells": [{"enrollment": 12, "achievement": 1, "score": null}],
     "computed": [{"enrollment_id": 12, "final_score": "1.00", "scale": "Bajo"}]
   }
   ```

### 3.2 Guardado de notas (modo ACHIEVEMENT)

- El docente ingresa notas directamente por logro.
- `POST /api/academic/grade-sheets/{id}/bulk_upsert/` recibe:
  ```json
  {
    "teacher_assignment": 5,
    "period": 2,
    "grades": [
      {"enrollment": 12, "achievement": 1, "score": "4.50"},
      {"enrollment": 12, "achievement": 2, "score": "3.80"}
    ]
  }
  ```
- El backend valida que cada `enrollment` e `achievement` sean válidos para esa planilla.
- Usa `AchievementGrade.objects.bulk_create(..., update_conflicts=True)` para inserciones/actualizaciones atómicas.
- Devuelve las notas definitivas recalculadas en tiempo real para los estudiantes afectados.

### 3.3 Guardado de notas (modo ACTIVITIES)

- El docente define columnas de actividad (`AchievementActivityColumn`) dentro del logro.
- `POST /api/academic/grade-sheets/{id}/activity_grades_bulk_upsert/` guarda notas por actividad.
- El backend recalcula automáticamente el promedio simple de actividades y actualiza `AchievementGrade.score` para la nota del logro.
- Nota: las actividades con `score=null` cuentan como `1.00` en el promedio.

### 3.4 Guardado de notas (modo QUALITATIVE — Preescolar)

- En lugar de `score` numérico, se guarda `AchievementGrade.qualitative_scale` (FK a `EvaluationScale` de tipo QUALITATIVE).
- El endpoint `POST /api/academic/grade-sheets/{id}/preschool_bulk_upsert/` gestiona este flujo.

### 3.5 Control de ventana de edición

```
Period.grades_edit_until (datetime)
  └─ Si es NULL → la planilla permanece editable mientras dure el periodo
  └─ Si la fecha pasó:
       └─ TEACHER necesita EditGrant activo (TYPE_FULL o TYPE_PARTIAL según el alcance)
       └─ ADMIN / COORDINATOR no tienen restricción de deadline
```

---

## 4. ¿Cómo se calcula la nota definitiva?

La definitiva **no se persiste** en ningún campo de la base de datos durante el periodo. Se recalcula dinámicamente en cada consulta a partir de los datos en `AchievementGrade`.

### 4.1 Algoritmo principal (`academic/grading.py`)

**Función `final_grade_from_achievement_scores(achievement_scores, dimension_percentage_by_id)`**

1. **Paso 1: Agrupar logros por dimensión.**  
   Cada logro tiene `(dimension_id, achievement_percentage, score)`.
   - Si `score = null` → se usa `DEFAULT_EMPTY_SCORE = 1.00`.

2. **Paso 2: Promedio ponderado dentro de cada dimensión.**  
   ```
   nota_dimension = Σ(score_i × weight_i) / Σ(weight_i)
   ```
   donde `weight_i = achievement.percentage`.

3. **Paso 3: Combinación ponderada de dimensiones.**  
   ```
   nota_definitiva = Σ(nota_dimension_j × porcentaje_j) / Σ(porcentaje_j)
   ```
   donde `porcentaje_j = Dimension.percentage` (configurado institucionalmente).

4. El resultado se redondea a 2 decimales.

**Ejemplo numérico:**

```
Dimensiones: Cognitivo (40%), Procedimental (35%), Actitudinal (25%)

Logros de Cognitivo (40%):
  - Logro A (50%): 4.00
  - Logro B (50%): 3.50
  → nota_cognitivo = (4.00×50 + 3.50×50) / 100 = 3.75

Logros de Procedimental (35%):
  - Logro C (100%): 4.20
  → nota_procedimental = 4.20

Logros de Actitudinal (25%):
  - Logro D (100%): 5.00
  → nota_actitudinal = 5.00

Nota definitiva = (3.75×40 + 4.20×35 + 5.00×25) / 100 = 4.10
```

### 4.2 Función auxiliar `weighted_average(items)`

Calcula promedio ponderado de una lista `[(score, weight)]`. Los `None` se reemplazan por `1.00`.

### 4.3 Función `match_scale(academic_year_id, score)`

Consulta `EvaluationScale` para determinar el nombre cualitativo de la nota (ej. "Alto", "Superior").

---

## 5. ¿Dónde se guarda la nota definitiva?

| Nivel | ¿Se persiste? | Fuente |
|---|---|---|
| Nota por logro (periodo) | **Sí** — `AchievementGrade.score` | Ingresada directamente o calculada desde actividades |
| Nota por actividad | **Sí** — `AchievementActivityGrade.score` | Ingresada por el docente; su promedio alimenta el logro |
| **Nota definitiva de asignatura por periodo** | **No** — calculada en tiempo real | `final_grade_from_achievement_scores()` |
| **Nota anual de asignatura** | **No** — calculada en tiempo real | Promedio de definitivas de todos los periodos |
| Resultado de promoción final | **Sí** — `EnrollmentPromotionSnapshot` | Snapshots sellados al cierre del año |

> **Clave arquitectural:** La nota definitiva de asignatura NO tiene base de datos propia. Cada reporte, planilla, sábana y comisión la recalcula ejecutando `final_grade_from_achievement_scores()` sobre los `AchievementGrade` almacenados. Esto garantiza consistencia total: si se corrige una nota de logro, todos los reportes la reflejan automáticamente.

---

## 6. ¿Cómo calculan la nota anual?

Función `_compute_subject_final_for_enrollments()` en `academic/promotion.py`:

1. Obtiene los `Achievement` válidos para el (`TeacherAssignment`, `Period`).
2. Carga los `AchievementGrade` existentes.
3. Ejecuta `final_grade_from_achievement_scores()` → nota definitiva del periodo.

Función `compute_promotions_for_year()` en `academic/promotion.py`:

```python
# Para cada asignatura × periodo → nota definitiva
subject_sum[enrollment_id, subject_id] += final_score_del_periodo
subject_count[enrollment_id, subject_id] += 1

# Nota anual = promedio simple de todos los periodos
nota_anual = subject_sum[eid, sid] / subject_count[eid, sid]
```

La nota anual de una asignatura es el **promedio aritmético simple** de sus notas definitivas período a período. No hay períodos con mayor o menor peso institucional en el cálculo base.

---

## 7. ¿De dónde toma la información el Boletín?

**Archivo:** `backend/students/academic_period_report.py`  
**Función principal:** `build_academic_period_report_context(enrollment, period)`

### 7.1 Fuentes de datos

| Dato en el boletín | Fuente en BD |
|---|---|
| Notas por asignatura (P1, P2, P3, P4) | `AchievementGrade` → `final_grade_from_achievement_scores()` |
| Nota de área | Promedio ponderado de asignaturas del área (a partir de `AcademicLoad.weight_percentage`) |
| Nota anual | Promedio de todos los periodos con nota existente |
| Escala cualitativa | `EvaluationScale` (Superior/Alto/Básico/Bajo) vía `match_scale()` |
| Inasistencias | `AttendanceRecord` (estado ABSENT + TARDY) por `TeacherAssignment` × `Period` |
| Logros / Indicadores de desempeño | `Achievement.description` + `PerformanceIndicator` del nivel correspondiente |
| Promedio general del periodo | Promedio de notas de ÁREA (o asignatura si el área tiene solo una) |
| Puesto en el grupo | Calculado en tiempo real comparando `_overall_decimal_from_rows()` de todos los pares |
| Datos institucionales | `Institution` (logo, encabezado) |
| Director de grupo | `Group.director` |

### 7.2 Lógica de filas (rows)

El boletín construye una lista plana de "filas" con la función `_build_rows_for_enrollment()`:

- **Fila AREA:** Resumen del área con notas P1–P4, nota final y promedio del periodo seleccionado.  
  - Si el área tiene solo una asignatura → se omite la fila AREA y se presenta la asignatura con `is_single_area=True`.
- **Fila SUBJECT:** Nota de la asignatura por periodo, con logros/descriptores del periodo seleccionado.

### 7.3 Variante preescolar

La función `build_preschool_academic_period_report_context()` usa las mismas fuentes pero:
- No calcula notas numéricas; muestra `AchievementGrade.qualitative_scale.name`.
- No hay puesto ni promedio general numérico.

### 7.4 Generación del PDF

Usa WeasyPrint. La ruta es:
```
context → render_to_string("students/reports/academic_period_report_pdf.html", context)
        → render_pdf_bytes_from_html()
```

---

## 8. ¿De dónde toma la información la Sábana de Notas?

**Archivo:** `backend/students/academic_period_sabana_report.py`  
**Función principal:** `build_academic_period_sabana_context(group, period)`

### 8.1 Concepto

La sábana es la vista tabular de grupo: filas = estudiantes (matrículas activas), columnas = todas las asignaturas del plan de estudios del grado.

### 8.2 Fuentes de datos

| Elemento | Fuente |
|---|---|
| Columnas (asignaturas) | `AcademicLoad` del grado del grupo, ordenado por área y asignatura |
| Filas (estudiantes) | `Enrollment` activas del grupo en el año académico |
| Notas por celda | `AchievementGrade` → `final_grade_from_achievement_scores()` (mismo algoritmo que el boletín) |
| Escala cualitativa por celda | `EvaluationScale` vía `match_scale()` → clase CSS de color |

### 8.3 Optimización de consultas

La sábana precarga todos los datos necesarios en un solo batch:
```python
score_by_enroll_gs_ach: Dict[(enrollment_id, gradesheet_id, achievement_id), score]
```
Esto evita N+1 queries al calcular la nota de cada celda.

### 8.4 Consistencia con el boletín

El sistema garantiza que la nota que aparece en la sábana para un estudiante sea **exactamente igual** a la mostrada en su boletín para el mismo periodo. Hay un test de integración explícito que lo valida:

```python
# backend/academic/test_gradebook.py
def test_sabana_uses_same_definitive_as_gradebook_with_partial_achievements(self):
    sabana = build_academic_period_sabana_context(group=self.group, period=self.period)
    sabana_row = next(r for r in sabana["rows"] if ...)
    self.assertEqual(Decimal(str(gradebook_row["final_score"])), Decimal(sabana_row["scores"][0]["score"]))
```

---

## 9. ¿Cómo usa las notas la Comisión de Evaluación y Promoción?

Las comisiones son el mecanismo institucional de seguimiento pedagógico. Hay dos tipos:

### 9.1 Prerrequisitos de las comisiones (`academic/commission_preconditions.py`)

Antes de crear una comisión se valida automáticamente:

| Tipo | Prerrequisito |
|---|---|
| **Evaluación** (por periodo) | El periodo debe estar **cerrado** (`Period.is_closed = True`) |
| **Promoción** (anual) | **Todos** los periodos del año deben estar cerrados |
| Ambas | Todas las asignaturas deben tener docente asignado (`TeacherAssignment` existente) |
| Ambas | Cada docente debe tener logros configurados (`Achievement`) |
| Ambas | Cada planilla debe existir y estar completamente diligenciada |

### 9.2 Comisión de Evaluación (periódica)

**Lógica en `commission_services.py → compute_difficulties_for_commission()`**

1. Obtiene todas las matrículas activas del grupo/año.
2. Para cada `TeacherAssignment` del grupo:
   - Llama a `_compute_subject_final_for_enrollments(teacher_assignment, period, enrollment_ids)`.
   - Compara la nota definitiva contra `PASSING_SCORE_DEFAULT = 3.00`.
   - Registra asignaturas y áreas reprobadas.
3. Aplica la regla configurable de `CommissionRuleConfig`:
   - `subjects_threshold` y `areas_threshold` (por defecto: 2).
   - Operador: `OR` (por defecto) o `AND`.
   - Un estudiante se marca como `is_flagged = True` si cumple el umbral.

**Decisiones** (`CommissionStudentDecision`):
- `PENDING` → pendiente de revisión
- `COMMITMENT` → el estudiante asume un compromiso académico (genera acta)
- `FOLLOW_UP` → seguimiento
- `CLOSED` → caso cerrado

### 9.3 Comisión de Promoción (anual)

**Lógica en `academic/promotion.py → compute_promotions_for_year()`**

1. Itera sobre todos los `TeacherAssignment` del año.
2. Para cada asignatura × periodo: calcula la definitiva del periodo.
3. Acumula para calcular la nota anual de cada asignatura por matrícula.
4. Entrega resultados a `siee.py → evaluate_promotion()`.

**Algoritmo SIEE (`academic/siee.py`):**

| Condición | Decisión |
|---|---|
| 0 áreas reprobadas Y 0 asignaturas reprobadas | `PROMOTED` (Promoción plena) |
| 1 área reprobada O ≤2 asignaturas reprobadas | `CONDITIONAL` (Promoción condicional) |
| ≥2 áreas reprobadas | `REPEATED` (Repitencia) |
| ≥3 asignaturas reprobadas en ≥3 áreas distintas | `REPEATED` (Repitencia) |

> **Nota:** Los estudiantes de preescolar (`level_type = "PRESCHOOL"`) siempre reciben `PROMOTED` (promoción automática).

**Decisiones de la comisión** → `CommissionStudentDecision` (mismos estados que evaluación).  
**Snapshots de resultado** → `EnrollmentPromotionSnapshot` (se sella con hash para auditoría).

### 9.4 Snapshot de rendimiento para la comisión (`academic/reports.py`)

La función `build_commission_performance_snapshot()` construye el informe de rendimiento del grupo:
- Lista de estudiantes con bajo rendimiento (los que tienen asignaturas reprobadas).
- Lista de los 2 mejores estudiantes del grupo.
- Nota: usa exactamente el mismo algoritmo de cálculo (`_compute_subject_final_for_enrollments`) que el boletín y la sábana.

---

## 10. Diagrama de dependencias de datos

```
AcademicYear
  └─ Period (P1, P2, P3, P4)
  └─ Dimension (Cognitivo 40%, Procedimental 35%, Actitudinal 25%)

Grade → AcademicLoad (Matemáticas, Grado 10, 5h/semana)
  └─ Achievement (Logro 1, Periodo P1, Dimensión: Cognitivo, Peso: 50%)
  └─ Achievement (Logro 2, Periodo P1, Dimensión: Cognitivo, Peso: 50%)
  └─ Achievement (Logro 3, Periodo P1, Dimensión: Procedimental, Peso: 100%)

TeacherAssignment (Docente X → Matemáticas → Grupo 10-1 → Año 2026)
  └─ GradeSheet (planilla de Matemáticas, P1, modo ACHIEVEMENT)
       └─ AchievementGrade (Enrollment 5, Logro 1, score=4.50)
       └─ AchievementGrade (Enrollment 5, Logro 2, score=3.80)
       └─ AchievementGrade (Enrollment 5, Logro 3, score=4.00)

Cálculo [en memoria, para Enrollment 5]:
  Cognitivo: (4.50×50 + 3.80×50)/100 = 4.15
  Procedimental: 4.00
  Nota P1 Matemáticas = (4.15×40 + 4.00×35 + ?×25) / (40+35+25) ← Actitudinal absent → 1.00×25
                      = (166 + 140 + 25) / 100 = 3.31

  Esta nota (3.31) aparece en:
    • Planilla del docente (celda computed)
    • Boletín del estudiante (columna P1 de Matemáticas)
    • Sábana del grupo (celda Enrollment5 × Matemáticas)
    • Comisión (comparado con umbral 3.00)
```

---

## 11. APIs REST expuestas

### Planillas y notas

| Método | URL | Descripción |
|---|---|---|
| `GET` | `/api/academic/grade-sheets/gradebook/` | Leer planilla completa (logros, estudiantes, celdas, computed) |
| `POST` | `/api/academic/grade-sheets/{id}/bulk_upsert/` | Guardar notas en modo ACHIEVEMENT |
| `POST` | `/api/academic/grade-sheets/{id}/activity_columns_bulk_upsert/` | Definir columnas de actividades |
| `POST` | `/api/academic/grade-sheets/{id}/activity_grades_bulk_upsert/` | Guardar notas por actividad |
| `POST` | `/api/academic/grade-sheets/{id}/reset/` | Limpiar toda la planilla |
| `PATCH` | `/api/academic/grade-sheets/{id}/` | Cambiar modo de calificación (grading_mode) |

### Reportes

| Método | URL | Descripción |
|---|---|---|
| `GET` | `/api/academic/grade-sheets/gradebook_filled_report/` | PDF de planilla completada (docente) |
| `GET` | `/api/students/{id}/academic_report/` | Boletín individual en PDF |
| `GET` | `/api/students/groups/{id}/academic_report/` | Boletines del grupo completo en PDF |
| `GET` | `/api/students/groups/{id}/sabana/` | Sábana de notas del grupo (PDF o JSON) |

### Comisiones

| Método | URL | Descripción |
|---|---|---|
| `POST` | `/api/academic/commissions/` | Crear comisión |
| `POST` | `/api/academic/commissions/{id}/sync_difficulties/` | Sincronizar estudiantes con dificultades |
| `GET` | `/api/academic/commissions/{id}/preconditions/` | Verificar prerrequisitos antes de crear |
| `PATCH` | `/api/academic/commission-decisions/{id}/` | Actualizar decisión por estudiante |

---

## 12. Reglas de negocio y restricciones importantes

1. **Nota mínima implícita:** Si un logro no tiene `AchievementGrade` registrado, el sistema usa `1.00` como nota por defecto en **todos** los cálculos (planilla, boletín, sábana, comisión). Esto garantiza que la nota definitiva nunca sea `null`.

2. **Nota de aprobación:** `PASSING_SCORE_DEFAULT = 3.00`. No es configurable desde la UI; está hardcodeada en `promotion.py`.

3. **Prioridad de logros por grupo:** Si existen `Achievement` con `group = <grupo específico>`, se usan esos. Si no, se usan los globales (`group = null`). Esto permite personalizar logros por grupo dentro del mismo grado.

4. **Cierre de periodo:** `Period.is_closed = True` es requisito para crear comisiones. Una vez cerrado, no se pueden modificar notas (salvo via `EditGrant`). Sin embargo, el cierre de periodo NO bloquea la apertura de `EditGrant`s.

5. **Año lectivo CLOSED:** Cuando se cierra un `AcademicYear`, todas las matrículas `ACTIVE` del año pasan a `RETIRED` automáticamente.

6. **Preescolar:** La evaluación cualitativa usa `EvaluationScale` de tipo `QUALITATIVE`. Los estudiantes de preescolar siempre se promueven (no se aplica el SIEE).

7. **Modo ACTIVITIES:** El promedio de actividades se recalcula y persiste en `AchievementGrade` cada vez que se actualiza una actividad. La nota almacenada en `AchievementGrade` siempre refleja el último promedio calculado.

8. **Consistencia garantizada por diseño:** Los módulos de boletín, sábana y comisión llaman exactamente a las mismas funciones de cálculo (`final_grade_from_achievement_scores`, `_compute_subject_final_for_enrollments`). No hay lógica de cálculo duplicada.

---

## 13. Archivos fuente clave

| Archivo | Responsabilidad |
|---|---|
| `backend/academic/models.py` | Todos los modelos de datos académicos |
| `backend/academic/grading.py` | Algoritmos de cálculo de notas (funciones puras) |
| `backend/academic/views.py` → `GradeSheetViewSet` | API de planillas, gradebook, bulk_upsert |
| `backend/academic/promotion.py` | Cálculo de notas anuales y decisión de promoción |
| `backend/academic/siee.py` | Reglas SIEE de promoción/repitencia |
| `backend/academic/commission_services.py` | Sincronización de dificultades en comisiones |
| `backend/academic/commission_preconditions.py` | Validación de prerrequisitos para comisiones |
| `backend/academic/reports.py` | Snapshot de rendimiento para la comisión (PDF) |
| `backend/students/academic_period_report.py` | Construcción del boletín individual |
| `backend/students/academic_period_sabana_report.py` | Construcción de la sábana de notas |
| `backend/academic/period_closure.py` | Cierre de periodo |

---

*Informe generado por análisis estático del código fuente. Cualquier cambio en `grading.py`, `promotion.py` o en el modelo `AchievementGrade` puede impactar simultáneamente todos los reportes (boletín, sábana y comisión).*
