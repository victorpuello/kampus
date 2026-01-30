# Implementación: Progreso de diligenciamiento en ficha del estudiante (responsive)

Fecha: 2026-01-29

## Objetivo

- Optimizar la UX en móvil y tablet de la pantalla de ficha del estudiante (`/students/:id`).
- Mostrar el **% global de diligenciamiento** de la ficha.
- El backend **NO debe calcular** el progreso si el usuario no cumple permisos.
- Mejorar performance con **cache por estudiante + año académico activo** usando Redis.

## Alcance funcional

- Visibilidad del progreso:
  - `TEACHER` **solo** si es director de grupo (ya está restringido por permisos/queryset del `StudentViewSet`).
  - `ADMIN` y `SUPERADMIN`.
  - Otros roles: el campo `completion` se devuelve como `null` (no se computa).

## Backend

### 1) Cache de Django (Redis)

- Se agrega configuración de cache en [backend/kampus_backend/settings.py](backend/kampus_backend/settings.py).
- Se usa Redis si existe `KAMPUS_CACHE_URL`. Si no existe, fallback a `LocMemCache`.

Variables relevantes:
- `KAMPUS_CACHE_URL` (ej: `redis://redis:6379/1`)
- `KAMPUS_CACHE_DEFAULT_TIMEOUT_SECONDS` (default: `21600` = 6h)

Docker:
- [docker-compose.yml](docker-compose.yml) ya incluye servicio `redis`.
- Se setea `KAMPUS_CACHE_URL=redis://redis:6379/1` en `backend`, `backend_worker`, `backend_scheduler`.

### 2) Cálculo con cache por estudiante/año activo

- Implementado en [backend/students/completion.py](backend/students/completion.py).
- Key:
  - `student_completion:v1:{academic_year_id}:{student_id}`
- TTL:
  - `KAMPUS_COMPLETION_CACHE_TTL_SECONDS` (default 6h).

Notas:
- El cálculo solo aplica si hay `AcademicYear` con estado `ACTIVE`.
- Si no hay año activo o no hay matrícula activa en el año activo, el payload incluye mensaje y `percent = null`.

### 3) Exposición del % en el detalle del estudiante

- Se extiende `retrieve()` en [backend/students/views.py](backend/students/views.py):
  - Si `role` ∈ {`TEACHER`, `ADMIN`, `SUPERADMIN`}:
    - Computa (cacheado) completion para ese `student_id` e inyecta `completion_by_student_id` al serializer.
  - Caso contrario:
    - Retorna el detalle sin computar completion (campo `completion: null`).

Esto mantiene el requisito: **no computar si no cumple permisos**.

### 4) Invalidación del cache (signals)

- Implementado en [backend/students/signals.py](backend/students/signals.py).
- Se invalida la key del estudiante (para el año activo) cuando cambian:
  - `Enrollment` (save/delete)
  - `Student` (save)
  - `FamilyMember` (save/delete)
  - `StudentDocument` (save/delete)

Helper utilizado:
- `invalidate_completion_cache_for_student(student_id)` en [backend/students/completion.py](backend/students/completion.py).

## Frontend (Responsive + Barra)

### 1) Componente de barra de progreso

- Nuevo componente: [kampus_frontend/src/components/students/StudentCompletionBar.tsx](kampus_frontend/src/components/students/StudentCompletionBar.tsx)
- Entrada: `completion: StudentCompletion`
- Salida: muestra `%` global y barra de color (verde/amarillo/rojo) y el mensaje si aplica.

### 2) Integración en la ficha del estudiante

- Se integra en el header de [kampus_frontend/src/pages/StudentForm.tsx](kampus_frontend/src/pages/StudentForm.tsx).
- Se guarda `completion` en state a partir de `studentsApi.get(id)`.
- La barra se muestra solo si `completion` viene no-null (lo cual ya está condicionado por permisos en backend).

Regla UX adicional:
- Si el backend responde que **no hay año académico activo**, el bloque se oculta para evitar ruido visual.
- Al guardar (update/create), se refresca `completion` desde la respuesta del API para que el % se actualice sin recargar.

### 3) UX móvil/tablet

Mejoras aplicadas en el header:
- Botonera de acciones en móvil pasa a ser **fila con scroll horizontal** (más nativo), sin forzar `w-full` y sin apilar todo.
- Título responsivo (`text-2xl` en móvil, `text-3xl` en pantallas `sm+`).

Mejoras aplicadas para seguimiento del progreso:
- En móvil (`< sm`), la barra de progreso se muestra como **sticky** justo debajo de los tabs.
- En tablet/desktop (`sm+`), la barra queda en el header.

## Verificación / pruebas

Backend:
- `python backend/manage.py test`

Frontend:
- `cd kampus_frontend && npm run lint`

Manual:
- Iniciar stack: `docker-compose up --build`
- Ir a `http://localhost:5173/students/285`
- Validar:
  - Admin/director ve barra con % (o N/D con mensaje si no aplica).
  - Roles no autorizados no ven la barra (porque `completion` llega null).
  - En móvil/tablet, acciones del header se desplazan en horizontal y la cabecera no “revienta” el layout.
