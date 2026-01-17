# Guía — Modo Actividades en Planilla de Notas

Fecha: 2026-01-17

## 1) ¿Qué es?
El **Modo Actividades** permite que el docente registre **varias notas por logro** (Actividad 1, Actividad 2, …) por estudiante, y que el sistema calcule automáticamente la **nota del logro** como **promedio simple**.

Este modo **coexiste** con el modo tradicional (nota directa por logro).

## 2) Regla de cálculo
- **Promedio simple** de las actividades activas del logro.
- **Celdas vacías cuentan como 1.0** al promediar.
- El promedio calculado **se persiste** en la nota del logro para mantener compatibilidad con:
  - cálculos por dimensión/nota final
  - reportes existentes

## 3) Cómo usarlo (docente)
1. Abra la planilla de notas del **periodo** y asignación.
2. En la parte superior de la planilla, cambie el toggle a **Actividades**.
3. Para cada logro:
   - Use **+ columna** para agregar actividades.
   - Cambie el nombre de la columna haciendo **edición inline** (confirmar/cancelar).
   - Para “eliminar” una columna, use **Desactivar** (soft delete).
4. Digite notas por actividad:
   - El promedio del logro se muestra como **Promedio (Logro)**.
   - Puede navegar con teclado: **Enter** y flechas **↑ ↓ ← →**.

## 4) Permisos y fechas límite
La edición respeta la regla de cierre por periodo:
- Si `Period.grades_edit_until` ya pasó, la edición puede quedar bloqueada.
- Excepciones vía **Edit Grants**:
  - Notas (celdas): un grant **PARTIAL/FULL** puede permitir editar un subconjunto (por matrícula/enrollment).
  - Estructura (columnas): requiere grant **FULL** después del cierre.

En caso de bloqueo, el backend responde con los ítems bloqueados para informar al UI.

## 5) Notas para desarrollo (API)
Rutas principales del modo actividades (por `GradeSheet`):
- Cambiar modo:
  - `POST /api/academic/grade-sheets/<id>/set-grading-mode/`
- Columnas:
  - `GET /api/academic/grade-sheets/<id>/activity-columns/`
  - `POST /api/academic/grade-sheets/<id>/activity-columns/bulk-upsert/`
- Notas de actividades:
  - `POST /api/academic/grade-sheets/<id>/activity-grades/bulk-upsert/`
- Carga de planilla:
  - `GET /api/academic/grade-sheets/<id>/gradebook/` (en `ACTIVITIES` incluye `activity_columns` y `activity_cells`)

## 6) FAQ / troubleshooting
- “¿Por qué el promedio cambia si dejo una actividad vacía?”
  - Porque los vacíos cuentan como **1.0**.
- “Desactivé una columna y desapareció”
  - Es intencional (soft delete). (Mejora opcional: vista de “Columnas ocultas” para reactivarlas.)
