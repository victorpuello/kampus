# Plan de implementación — Modo híbrido de seguimiento de notas por actividades (mobile-first)

Fecha: 2026-01-17

## 1) Objetivo
Permitir a docentes registrar **notas de actividades del día a día** por estudiante y por logro, con **columnas etiquetadas** (ej. Actividad 1, Actividad 2, …), y que el **promedio simple** de esas actividades sea la **equivalencia de la nota del logro** (la misma que hoy se digita en el gradebook por logros).

Debe coexistir con el modo tradicional actual (nota directa por logro) sin obligar a todos los docentes a cambiar su flujo.

## 2) Reglas funcionales
- Modo híbrido:
  - **Tradicional**: el docente escribe directamente la nota del logro (comportamiento actual).
  - **Actividades**: el docente crea columnas de actividades por logro y registra notas por actividad; el sistema calcula automáticamente la nota del logro.
- Cálculo:
  - **Promedio simple**.
  - **Vacíos cuentan como 1.0** al promediar.
  - (Se confirmará rango/validación de nota según la escala vigente del sistema.)
- Etiquetas:
  - Cada columna tiene un **label editable** (por defecto: “Actividad 1…N”).
  - El docente puede **agregar/eliminar/reordenar** columnas (con restricciones para no perder consistencia histórica).
- Activación:
  - Se activa por **asignación del docente + periodo** (teacher assignment + period).
  - La configuración de columnas es **por logro** dentro de ese contexto.

## 3) Estado actual (referencias del repo)
- Backend gradebook (nota por logro):
  - `backend/academic/models.py` (models de planeación/logros/planilla/celdas)
  - `backend/academic/migrations/0015_gradebook_activity_mode.py` (modo + tablas de actividades)
  - `backend/academic/serializers.py`
  - `backend/academic/views.py`
  - `backend/academic/urls.py`
- Frontend ingreso de notas por logro:
  - `kampus_frontend/src/pages/Grades.tsx`
  - `kampus_frontend/src/services/academic.ts`
  - `kampus_frontend/src/services/api.ts`

### 3.1 Estado de implementación (2026-01-17)
- ✅ Backend: implementado el modo híbrido a nivel de `GradeSheet.grading_mode`.
- ✅ Backend: modelos `AchievementActivityColumn` y `AchievementActivityGrade` + migración aplicada.
- ✅ Backend: endpoints para alternar modo, administrar columnas y upsert masivo de notas de actividades.
- ✅ Backend: recomputo de promedio (vacíos=1.0) y persistencia en `AchievementGrade` para compatibilidad con cálculos/reportes.
- ✅ Frontend: UI en planilla de notas con toggle Tradicional/Actividades, columnas por logro, promedio visible, autosave y guardado masivo.
- ✅ Frontend: renombrar columnas inline y desactivar columnas (soft delete con `is_active=false`).
- ✅ Frontend: navegación por teclado en celdas de actividades (Enter/↑↓←→ tipo planilla).
- ✅ Validación backend: migración aplicada y `python manage.py test academic` pasando.
- ✅ Documentación: guía de uso y notas técnicas en `docs/modo_actividades_notas.md`.
- ⚠️ Validación frontend: existen errores de lint previos en el repo; se corrigió el único error nuevo detectado en la pantalla de notas.

## 4) Diseño técnico propuesto (MVP)

### 4.1 Modelo de datos (recomendado: normalizado)
Agregar dos entidades:
1) Definición de columnas por logro
- `AchievementActivityColumn` (nombre sugerido)
  - FK a `GradeSheet` (sheet del docente + periodo)
  - FK a `Achievement` (logro)
  - `label` (string)
  - `order` (int)
  - `is_active` (bool) opcional

2) Notas por actividad
- `AchievementActivityGrade`
  - FK a `AchievementActivityColumn`
  - FK a `Enrollment`
  - `score` (decimal nullable)
  - Unique constraint: (column, enrollment)

Notas:
- La **nota del logro** seguirá existiendo en el modelo actual (celda por logro). En modo actividades se **deriva** (promedio) y se **persistirá** en la celda de logro para mantener compatibilidad con:
  - cálculos por dimensión
  - reportes
  - estadísticas

### 4.2 API (MVP)
Extender el viewset del gradebook (planilla) con acciones específicas para modo actividades:
- Cambiar modo de calificación:
  - `POST /api/academic/grade-sheets/<id>/set-grading-mode/` → cambia `grading_mode` (y opcionalmente crea columnas por defecto “Actividad 1..N”).
- Columnas de actividades:
  - `GET /api/academic/grade-sheets/<id>/activity-columns/` → lista columnas (incluye logro, label, order, is_active).
  - `POST /api/academic/grade-sheets/<id>/activity-columns/bulk-upsert/` → crea/actualiza columnas en lote.
- Notas de actividades:
  - `POST /api/academic/grade-sheets/<id>/activity-grades/bulk-upsert/` → upsert masivo de {column, enrollment, score}.
- Carga del gradebook:
  - `GET /api/academic/grade-sheets/<id>/gradebook/` → en `ACTIVITIES` también retorna `activity_columns` y `activity_cells`.

### 4.3 Cálculo (MVP)
- Para un `GradeSheet + Achievement`:
  - Obtener columnas activas.
  - Para cada estudiante (enrollment):
    - score por columna = value si existe, si no → **1.0**
    - promedio simple = sum(scores) / N
  - Persistir promedio en la celda de logro existente.

### 4.4 UI/UX (mobile-first, híbrida)
En la pantalla actual de gradebook:
- Toggle visible (y persistente) “Tradicional / Actividades”.
- En modo actividades:
  - Por cada logro se muestran subcolumnas (Actividades) + una columna “Promedio (Logro)” (read-only).
  - Botón “+ columna” para ese logro.
  - Edición in-place del label (modal pequeño o inline).
  - Teclado numérico y navegación rápida entre celdas.
  - Scroll horizontal con header y primera columna sticky, optimizado para móvil.

## 5) Rollout y compatibilidad
- Feature flag por docente/asignación/periodo.
- No migrar históricos obligatoriamente.
- Mantener reportes/cálculos sin cambios: consumen la nota del logro persistida.

## 6) Riesgos y mitigaciones
- Performance por explosión de celdas:
  - cargar por dimensión/logro (lazy)
  - batch writes
  - limitar columnas (ej. 2–12) configurable
- Integridad al borrar columnas:
  - soft delete si hay notas
- UX móvil:
  - vista compacta, sticky header, input numérico, y estados claros de guardado

## 7) Criterios de aceptación (MVP)
- Docente puede activar modo actividades por periodo.
- Docente puede crear columnas con etiquetas por logro.
- Docente puede digitar notas por actividad.
- Sistema calcula promedio simple con vacíos=1.0.
- La nota del logro queda actualizada y los reportes/cálculos existentes reflejan ese valor.

## 8) Pendientes recomendados
- Cierre/QA:
  - Confirmar en staging que el toggle Tradicional/Actividades se persiste por `GradeSheet`.
  - Validar un caso real con fecha límite (`grades_edit_until`) y grants (PARTIAL vs FULL).
- Mejoras UX en frontend:
  - (Opcional) reactivar columnas desactivadas (vista “Columnas ocultas”).
