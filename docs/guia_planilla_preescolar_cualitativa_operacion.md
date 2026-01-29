# Guía operativa: Planilla Preescolar Cualitativa (SIEE)

Esta guía describe cómo **habilitar** y **usar** la planilla de calificaciones cualitativa para **Preescolar**.

## 1) Requisitos

- Año lectivo activo (ej. 2026).
- Docente con **asignaciones** cuyo grupo pertenezca a un grado cuyo nivel sea `PRESCHOOL`.
- Planeación del periodo: la planilla se alimenta de **logros** (`Achievement`) del periodo (si no hay logros, no hay columnas para valorar).

## 2) Configurar la escala cualitativa SIEE (Preescolar)

La planilla usa registros `EvaluationScale` de tipo `QUALITATIVE` asociados al **año lectivo**.

### 2.1 Regla de selección (backend)

El backend busca etiquetas con este orden de prioridad:

1. `EvaluationScale(academic_year=<año>, scale_type=QUALITATIVE, applies_to_level=PRESCHOOL)`
   - Si existen, usa preferiblemente las que tengan `is_default=true`.
2. Fallback (compatibilidad): `EvaluationScale(..., applies_to_level IS NULL)`
   - Esto permite funcionar si la institución tenía escalas cualitativas antiguas sin nivel.

### 2.2 Campos esperados

Para cada etiqueta cualitativa (ej. “Avanza con seguridad”):

- `academic_year`: año lectivo (ej. 2026)
- `scale_type`: `QUALITATIVE`
- `applies_to_level`: `PRESCHOOL` (recomendado)
- `is_default`: `true` para que aparezca como opción principal
- `order`: orden de presentación en UI (1, 2, 3…)
- `internal_numeric_value` (opcional): valor interno para compatibilidad técnica (no se muestran números en UI)

### 2.3 Escala sugerida (2026)

- 1) Avanza con seguridad
- 2) En proceso
- 3) Requiere acompañamiento intensivo

## 3) Planeación (logros) para habilitar columnas

La planilla muestra **logros del periodo** como columnas. Si el docente entra y ve “Sin logros” o no aparecen opciones para valorar:

- Verificar que existan `Achievement` para ese:
  - `period` actual
  - `academic_load` de la asignación
  - `group` (o `group=NULL` como fallback)

En la UI se muestra un aviso y un CTA para ir a Planeación cuando no hay logros.

## 4) Acceso y navegación (docente)

### 4.1 Menú lateral

- Si el docente es **solo-preescolar** (todas sus asignaciones son de preescolar):
  - Verá una única opción **“Calificaciones”** que lo lleva a `/grades/preschool`.
  - No verá la opción de calificación tradicional.
- Si el docente tiene carga **mixta** (preescolar + otros niveles):
  - Verá “Calificaciones” (tradicional) y una opción adicional “Preescolar (Cualitativa)”.

### 4.2 Listado de planillas

Ruta: `/grades/preschool`

- Seleccionar **Periodo** (por defecto intenta seleccionar el periodo actual).
- Ver el listado de asignaciones disponibles (con buscador y paginación).
- Indicador “Planeación OK / Sin logros” usa `achievements_count` del endpoint `available`.

### 4.3 Abrir planilla

Ruta: `/grades/preschool/:teacherAssignmentId/:periodId`

- Carga estudiantes (matrículas activas del grupo).
- Carga logros del periodo para construir columnas.
- Permite seleccionar etiqueta cualitativa por celda.
- Tiene **autoguardado** y botón manual de guardar.

## 5) Reglas de bloqueo (igual que la planilla numérica)

Se aplican estas reglas:

- **Solo periodo actual**.
- Si `period.is_closed=true` → no permite guardar.
- Si `period.grades_edit_until` expiró →
  - solo permite editar si existe un **Edit Grant** válido:
    - `FULL`: permite toda la planilla
    - `PARTIAL`: permite solo matrículas incluidas en el grant

## 6) Verificación rápida (API)

- Etiquetas: `GET /api/preschool-gradebook/labels/?academic_year=<id>`
- Disponibles: `GET /api/preschool-gradebook/available/?period=<id>`
- Gradebook: `GET /api/preschool-gradebook/gradebook/?teacher_assignment=<id>&period=<id>`
- Guardar: `POST /api/preschool-gradebook/bulk-upsert/`

## 7) Troubleshooting

- **401 No autenticado**: revisar token (Bearer) en frontend.
- **403 No autorizado**: el docente no tiene asignaciones en grupos `PRESCHOOL`.
- **No hay opciones para valorar**: faltan logros/planeación para el periodo y asignación.
- **No hay etiquetas cualitativas**: no existen `EvaluationScale` `QUALITATIVE` para el año; configurar escalas.
