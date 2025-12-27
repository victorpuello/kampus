# Plan de trabajo para terminar la implementación del Observador del Estudiante

Fecha: 26 dic 2025

Este plan aterriza los pendientes necesarios para llevar Kampus desde el **MVP de convivencia/bitácora legal** (ya implementado) hacia un **Observador del Estudiante “completo”** como lo exige el marco descrito en:
- `docs/Observador Estudiantil y Software Académico.md`
- `docs/descripcion.md` (Pestaña 4: Observador del Alumno; Módulo 6 Convivencia)

> Principio de priorización: **primero probatorio/legal (debido proceso + cadena de custodia + privacidad)**, luego **operación Ley 1620 (rutas + manual parametrizable)**, y por último **producto completo (observador integral, analítica, offline, interoperabilidad)**.

---

## Estado actual (baseline)

Ya existe en el app `discipline`:
- Registro de casos, participantes, adjuntos, eventos, descargos, decisión y cierre.
- Acta imprimible HTML por caso.
- Notificación trazable a acudiente (log) + acuse manual.
- Plazo de descargos (`descargos_due_at`) + cálculo de vencido.
- Scheduler en Docker (`backend_scheduler`) que ejecuta alertas por vencimiento de descargos.

Además (Fase 1 completada):
- Portal autenticado para acudientes (rol `PARENT`) con acceso restringido a casos de sus acudidos.
- Enterado/acuse autenticado por acudiente en notificaciones registradas.

Esto cubre una parte crítica del “expediente disciplinario”, pero el “Observador al 100%” requiere más módulos y garantías (ver fases).

---

## Definición de “100%” (entregable final)

Para considerar el Observador “completo” en sentido del documento, el sistema debe cubrir como mínimo:
1) **Observador integral** (no solo disciplinario): anotaciones positivas y académicas + feed con filtros.
2) **Convivencia Ley 1620**: tipificación correcta (Tipo I/II/III), rutas, protocolos y seguimiento.
3) **Portal acudiente/estudiante**: consulta segura + evidencia de enterado/firma.
4) **Seguridad probatoria**: auditoría de acceso/impresión + sellado/inmutabilidad post-cierre.
5) **Gestión documental**: retención/TRD y depuración básica.
6) **Interoperabilidad** (al menos export SIUCE e import/carga SIMAT) y reportes.

---

## Fase 0 (P0) — Blindaje legal/probatorio (cadena de custodia)

### 0.1 Auditoría de accesos y acciones sensibles
**Objetivo:** registrar evidencia de quién accede a información sensible.

Estado: **COMPLETADO** (backend).

- Backend
  - Crear modelo `AuditLog` (app nueva o `core/`), eventos mínimos:
    - login/logout (si aplica),
    - view case detail,
    - download acta,
    - create/edit/close/decide,
    - export/report.
  - Capturar: `user`, `event_type`, `object_type`, `object_id`, `timestamp`, `ip`, `user_agent`, `metadata`.
  - Middleware DRF para registrar lecturas sensibles (p. ej. endpoints de `discipline`).
  - Endpoint solo ADMIN/SUPERADMIN para consultar auditoría con paginación.

**Criterio de aceptación**
- Cada visita a `GET /api/discipline/cases/:id/` genera `AuditLog`.
- Descargar acta genera `AuditLog`.
- Solo ADMIN/SUPERADMIN pueden listar auditoría.

### 0.2 Sellado e inmutabilidad (post-cierre)
**Objetivo:** que el expediente tenga integridad; correcciones sin sobrescritura.

Estado: **COMPLETADO** (backend + UI básica).

- Backend
  - Agregar a `DisciplineCase` (o entidad de “registro sellado”):
    - `sealed_at`, `sealed_by`, `sealed_hash`.
  - En `close()` (o al cerrar): generar hash sobre un payload estable (campos + eventos + adjuntos + participantes + decision).
  - Restringir actualizaciones: si `sealed_at` != null, bloquear edición de campos “fuertes”; permitir solo:
    - agregar `DisciplineCaseEvent` tipo `NOTE` como “aclaración”,
    - adjuntos adicionales solo si son “soportes” y quedan como evidencia (opcional según política).

**Criterio de aceptación**
- Caso cerrado queda sellado con hash.
- Intento de editar narrativa/ocurrencia/decision retorna 400/403.
- Aclaraciones se registran como evento nuevo (append-only).

---

## Fase 1 (P0) — Portal de acudientes + evidencia de notificación/enterado

### 1.1 Vista segura del caso para acudientes
**Objetivo:** el acudiente autenticado pueda ver el caso sin filtrar datos en notificación.

Estado: **COMPLETADO** (backend + UI).

- Backend
  - Definir permisos: PARENT solo ve casos donde sea acudiente del estudiante.
  - Endpoint `GET /api/discipline/cases/:id/` debe filtrar/permitir acceso con regla “guardian”.
  - Definir qué campos verán (mínimo: hechos, plazos, compromisos, eventos relevantes, adjuntos permitidos).

Notas de seguridad
- Se adopta política de **no revelar existencia**: si un PARENT intenta acceder a un caso fuera de su queryset, el sistema responde **404**.

- Frontend
  - Reusar listado/detalle de Convivencia permitiendo rol `PARENT`.
  - Para `PARENT`, la vista opera en modo **solo lectura** (sin acciones mutantes).

### 1.2 “Enterado/Firma simple” autenticada
**Objetivo:** reemplazar el acuse manual como evidencia principal.

Estado: **COMPLETADO** (backend + UI).

- Backend
  - Acción `acknowledge_guardian` debe permitir que el propio `recipient_user` haga ACK.
  - Guardar: `acknowledged_at`, `acknowledged_by` (el acudiente), y texto opcional.
  - (Opcional) OTP por email/SMS si se requiere “enterado” sin login (dejar para fase 3 si no es MVP).

Notas de seguridad
- Si un PARENT distinto intenta hacer ACK de un caso/no-log que no le pertenece, se responde **404** por política de no revelar existencia.

**Criterio de aceptación**
- Acudiente logueado puede marcar “enterado” y queda trazado.
- En el acta se ve el enterado con fecha/hora.

---

## Fase 2 (P1) — Manual de Convivencia parametrizable + protocolos (Ley 1620)

### 2.1 Catálogo de faltas y tipificación
**Objetivo:** que el manual sea configurable y que el sistema guíe/valide.

- Backend (app `discipline` o app nueva `convivencia`)
  - Modelos sugeridos:
    - `DisciplineInfraction` (nombre, tipo Ley 1620 I/II/III, severidad manual, requiere_reporte_siuce, etc.)
    - `DisciplineProtocolStep` (infraction, orden, rol_responsable, acción, plazo_días)
    - `PedagogicalActionCatalog` (acciones formativas)
  - En creación de caso: seleccionar `infraction_id` (en vez de solo strings) y derivar Tipo I/II/III.

### 2.2 Workflow guiado por protocolo
**Objetivo:** que el caso tenga “checklist” de pasos y plazos.

- Backend
  - Crear entidad `CaseTask`/`CaseStep` instanciada desde el protocolo.
  - Estados: PENDING/IN_PROGRESS/DONE/BLOCKED.
  - Bloquear cierre/decisión si hay pasos obligatorios pendientes.

**Criterio de aceptación**
- ADMIN/COORDINATOR configuran el manual (CRUD).
- Caso genera pasos automáticos.
- UI muestra pasos y responsables.

---

## Fase 3 (P1) — Observador integral (feed unificado: positivo + académico + convivencia)

### 3.1 Modelo de anotación general
**Objetivo:** “Observador del Alumno” como feed cronológico de anotaciones (no solo casos).

- Backend (probable app `students` o app nueva `observador`)
  - Modelo `StudentObservation`:
    - `student`, `author`, `created_at`, `type` (POSITIVE, ACADEMIC_WARNING, CONVIVENCIA, etc.)
    - `description`, `actions_taken`, `commitments`
    - relación opcional a `DisciplineCase` si es derivada.
  - Endpoint de feed por estudiante con filtros por fecha/autor/tipo.

- Frontend
  - En perfil del estudiante: pestaña “Observador” como timeline, con filtros básicos.

**Criterio de aceptación**
- Se puede crear anotación positiva.
- Se puede crear anotación académica.
- Se puede navegar desde anotación a caso disciplinario si existe.

---

## Fase 4 (P2) — Interoperabilidad: SIUCE + SIMAT

### 4.1 Exportación SIUCE
- Backend
  - Mapeo de casos Tipo II/III a formato requerido (CSV/JSON según defina el equipo).
  - Validaciones: impedir cierre de Tipo II/III si faltan campos mínimos SIUCE.

### 4.2 Importación/carga SIMAT
- Backend
  - Importador de anexos SIMAT (al menos `csv/txt`) para estudiantes/matrículas.
  - Regla: matrícula “Retirado” bloquea nuevas anotaciones, conserva histórico.

---

## Fase 5 (P2/P3) — Privacidad avanzada, TRD, analítica y offline

### 5.1 Sigilo de orientación/psicosocial
- Separar notas clínicas; permisos estrictos; auditoría reforzada.

### 5.2 TRD/retención/derecho al olvido
- Políticas configurables por tipo de registro.
- Archivado vs eliminación segura.

### 5.3 Analítica convivencia
- Dashboard: incidentes por tipo/curso/periodo, reincidencia.
- (Opcional) mapa de calor por lugar.

### 5.4 Offline
- PWA con cache + cola de escritura y sincronización.

---

## Checklist de ejecución (orden recomendado)

1. ✅ (P0) Auditoría de accesos + vista admin.
2. ✅ (P0) Sellado/hash e inmutabilidad post-cierre.
3. ✅ (P0) Permisos y portal acudiente (lectura segura).
4. ✅ (P0) Enterado autenticado por acudiente.
5. (P1) Manual parametrizable + catálogo de acciones.
6. (P1) Protocolos/pasos + bloqueos por pendientes.
7. (P1) Observador integral (anotaciones no disciplinarias).
8. (P2) Export SIUCE + validaciones.
9. (P2) Import SIMAT + estados.
10. (P2/P3) TRD + sigilo + analítica + offline.

---

## Notas técnicas (repo)

- Backend: Django/DRF con JWT; permisos por rol (default `IsAuthenticated`).
- Frontend: React/Vite/TS; servicios en `kampus_frontend/src/services`.
- Docker: `docker-compose.yml` ya incluye `backend_scheduler`.

Siguiente paso sugerido: iniciar **Fase 2 (P1) — Manual de Convivencia parametrizable + protocolos (Ley 1620)** (2.1 + 2.2). Es el siguiente bloque necesario para pasar del MVP disciplinario a operación guiada por tipificación y rutas.
