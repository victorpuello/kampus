# Sprint: Indicador de progreso (Directores de grupo)

## Objetivo
Habilitar en la pantalla de **Estudiantes** (para docentes directores) una **barra/indicador de progreso** que muestre el **% de completitud** de la ficha y documentos de cada estudiante, con **breakdown por sección**, y un **resumen del grupo** (promedio + semáforo).

## Alcance (v1)
- Solo visible/usable en el listado de estudiantes para docentes con rol `TEACHER` y que sean **directores de grupo**.
- Cálculo con **campos de peso uniforme** y **breakdown por sección**.
- Si el estudiante **no tiene matrícula activa** en el año académico activo: `percent = null` + `message`.
- Documento **Certificado académico** obligatorio **solo para nuevo ingreso** (heurística v1).

## Entregables
- Backend: cálculo de completitud + respuesta en `/api/students/?include_completion=1`.
- Frontend: columna/barra de progreso por estudiante + card de resumen del grupo (semáforo) en la misma pantalla.
- Tests backend que cubran la salida mínima (completion + group summary).

---

## Definición de “completitud” (Ruleset v1)

### Secciones y campos (uniforme)
Cada item cuenta 1 punto.

1) **Identificación** (modelo `students.Student`)
- `document_type`
- `document_number`
- `place_of_issue`
- `nationality`
- `birth_date`
- `sex`
- `blood_type`
- `photo` (fotografía del estudiante)

2) **Residencia y contacto**
- `address`
- `neighborhood`
- `phone`
- `living_with`
- `stratum`

3) **Información socioeconómica**
- `ethnicity`
- `sisben_score`
- `eps`

4) **Desarrollo integral y apoyos**
- Condicional: solo cuenta si `has_disability = true`
  - `disability_description`
  - `disability_type`
  - `support_needs`

5) **Salud y emergencia**
- `allergies`
- `emergency_contact_name`
- `emergency_contact_phone`
- `emergency_contact_relationship`

6) **Referencias familiares**
- Completo si existe al menos un `FamilyMember` que sea:
  - `is_main_guardian = true` **o** `relationship in {"Padre", "Acudiente"}`
  - y además tenga `document_number` y `identity_document` (archivo)

7) **Documentos** (modelo `students.StudentDocument`)
- Siempre requeridos:
  - `IDENTITY` (Documento de identidad)
  - `EPS` (Certificado EPS / ADRES)
- Requerido por nivel:
  - `VACCINES` si el nivel es `PRESCHOOL` o `PRIMARY`
- Requerido solo para nuevo ingreso (v1):
  - `ACADEMIC` si es nuevo ingreso **y** `origin_school` no está vacío

### “Nuevo ingreso” (heurística v1)
Se considera nuevo ingreso si **no existe** una matrícula previa “real” en años anteriores al año activo:
- `Enrollment.academic_year.year < active_year.year`
- Se ignoran registros importados de historial (`final_status` inicia con `IMPORTADO`) y/o matrículas sin grupo.

### Sin matrícula activa
Si no existe `Enrollment` con:
- `academic_year = ACTIVE`
- `status = ACTIVE`
Entonces:
- `percent = null`
- `message = "Sin matrícula activa en el año actual; no se calcula el progreso."`

---

## Historia de usuario
**Como** docente director de grupo
**quiero** ver el % de completitud de la ficha de cada estudiante
**para** asegurar que la información obligatoria esté al día.

---

## Metas chequeables (Acceptance Criteria)

### Backend
- [x] `GET /api/students/?include_completion=1` (para `TEACHER`) devuelve `group_completion` y cada estudiante incluye `completion`.
- [x] `completion.percent` es `int` 0..100 cuando hay matrícula activa.
- [x] `completion.percent` es `null` y `completion.message` tiene el texto acordado cuando no hay matrícula activa.
- [x] `group_completion` incluye `avg_percent` y `traffic_light` con valores `green|yellow|red|grey`.
- [x] Regla vacunas: `VACCINES` requerido solo en `PRESCHOOL|PRIMARY`.
- [x] Regla certificado académico: `ACADEMIC` requerido solo para nuevo ingreso (v1).

### Frontend
- [x] Para docentes directores, el listado muestra una columna/tarjeta “Progreso” con barra y porcentaje.
- [x] Encima del listado se muestra un resumen del grupo con semáforo y promedio.
- [x] Si `percent` es `null`, se muestra `N/D` y el mensaje.

### Calidad
- [x] Tests backend pasan (`backend/manage.py test students`).
- [x] Frontend pasa lint (`npm run lint`).

---

## Plan de trabajo (Sprint)

### Día 1 – Backend
- [x] Implementar cálculo en `backend/students/completion.py`.
- [x] Exponerlo en `StudentViewSet.list` con `include_completion=1`.
- [x] Extender `StudentSerializer` con campo `completion`.
- [x] Agregar tests en `backend/students/tests.py`.

### Día 2 – Frontend
- [x] Ajustar tipos TS (`StudentCompletion`, `GroupCompletionSummary`).
- [x] Mostrar card de resumen del grupo (semáforo + promedio) en `StudentList`.
- [x] Mostrar barra/porcentaje por estudiante en mobile + desktop.

### Día 3 – Ajustes y verificación
- [x] Afinar umbrales del semáforo (default: verde ≥ 90, amarillo ≥ 70, rojo < 70).
- [x] Validación técnica automatizada completa (`backend/manage.py test students` → 52 tests OK).
- [ ] Validar con datos reales: directores con estudiantes en preescolar/primaria.
- [x] Ajustar ruleset si aparecen campos institucionales adicionales.

---

## Notas de implementación
- Para evitar impacto de performance en listados generales, el cálculo se activa solo para `TEACHER` y cuando el request incluye `include_completion=1`.
- El resumen del grupo se calcula sobre el queryset filtrado (mismos parámetros de búsqueda/filtros), pero sin paginación.
- Umbrales del semáforo configurables por entorno:
  - `KAMPUS_COMPLETION_TRAFFIC_LIGHT_GREEN_MIN` (default: `90`)
  - `KAMPUS_COMPLETION_TRAFFIC_LIGHT_YELLOW_MIN` (default: `70`)
- Ruleset extensible por entorno para campos de `Student`:
  - `KAMPUS_COMPLETION_EXTRA_STUDENT_FIELDS` (csv), se agrega como sección `institucional`.
- Campos excluidos del cálculo por defecto:
  - `allergies`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship`.
- Campo explícitamente requerido en el cálculo:
  - `photo` (fotografía del estudiante).
