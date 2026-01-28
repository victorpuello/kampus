# Plan de trabajo — Módulo **Novedades** (Estudiantes)

Fecha: 2026-01-27  
Repo: Kampus (Django REST `backend/` + React `kampus_frontend/`)  
Estrategia: **Opción B** — nueva app Django `backend/novelties/` como *case management* (workflow) que **referencia** entidades core (`students`, `academic`) y ejecuta cambios vía **service layer** transaccional.

---

## 0) Objetivo y definición de éxito

Implementar un sistema robusto para registrar, tramitar, aprobar, ejecutar y revertir “novedades” en estudiantes (ingresos, retiros, traslados, cambios internos, etc.), con:

- Workflow configurable por tipo (estados + roles por transición).
- Checklist configurable de soportes (adjuntos) antes de aprobar/ejecutar.
- Validaciones duras para evitar inconsistencias.
- Ejecución transaccional (todo o nada) que impacta **matrícula/estado/cupos/asignación**.
- Auditoría completa por novedad y línea de tiempo por estudiante.
- Bandejas de pendientes + notificaciones + SLA.

**Éxito** = puede operarse en producción sin “parches manuales” de matrícula/cupos y con trazabilidad completa.

---

## 1) Alcance funcional (MVP + ampliaciones)

### 1.1 Tipos de novedad (MVP)
- Ingreso / Matrícula
- Reingreso
- Retiro (voluntario/disciplinario/traslado/fallecimiento/etc.)
- Traslado (a otra IE / desde otra IE) — inicialmente como “traslado externo” (impacta estado y observaciones)
- Cambio interno: sede, jornada, grado, grupo

### 1.2 Tipos de novedad (Fase 2)
- Actualización de datos (documento, acudiente, dirección) como novedad trazable
- Anulación / reversión por error de radicado (con causal + permisos)

---

## 2) Decisiones de arquitectura (alineadas al repo)

### 2.1 Separación de responsabilidades
- `students`: identidad y datos del estudiante; no se duplica.
- `academic`: sedes/grades/grupos/años; cupo/capacidad existente por grupo.
- `novelties`: casos (workflow + adjuntos + bitácora) y *motor de ejecución* que invoca servicios para aplicar cambios al core.

### 2.2 API y permisos
- API REST DRF bajo `/api/novelties-workflow/`.
- Permisos basados en el patrón existente (`backend/users/permissions.py` + `backend/core/permissions.py`).
- Permisos Django (view/add/change/delete) para modelos de `novelties` y “acciones” (aprobar/ejecutar/revertir) controladas por roles.

### 2.3 Notificaciones y auditoría
- Reusar `backend/notifications` para notificaciones in-app.
- Reusar `backend/audit` para eventos técnicos, y además tener una bitácora **inmutable** específica por novedad (auditoría funcional).

### 2.4 Concurrencia y cupos
- Mantener cupo actual por grupo.
- Añadir cupo “bucket” (macro) por sede+grado+jornada+año, y overrides por grupo.
- Lock por recurso durante ejecución (Redis) para evitar sobreasignación en ingresos/traslados.

---

## 3) Modelo conceptual (entidades)

### 3.1 Catálogos y parametrización
- `NoveltyType`: código, nombre, activo, configuración (si aplica).
- `NoveltyReason`: FK a tipo, nombre, activo.
- `NoveltyRequiredDocumentRule`: FK a tipo/motivo, doc_type, obligatorio, visibilidad por rol.
- `NoveltyApprovalFlow`: por institución (si aplica) + tipo.
- `NoveltyApprovalStep`: orden, rol requerido, puede_devolver, puede_rechazar, requiere_firma.

### 3.2 Caso (workflow)
- `NoveltyCase`:
  - student (FK)
  - enrollment (FK opcional si aplica)
  - type, reason
  - status (draft / filed / in_review / pending_docs / approved / rejected / executed / closed)
  - consecutivo/radicado único por institución y año
  - fechas: solicitud, efectiva, ejecución, cierre
  - payload de destino (p.ej. group_destino, sede_destino…)
  - idempotency_key (por ejecución)

- `NoveltyCaseTransition` (bitácora inmutable):
  - from_status, to_status
  - actor (user), rol, timestamp
  - comentario/observación
  - firma lógica (nombre/cargo/fecha/IP)

### 3.3 Adjuntos/soportes
- `NoveltyAttachment`:
  - case (FK)
  - doc_type
  - archivo (PDF/JPG/PNG)
  - fecha, emitido_por, vigencia
  - visibility (quién puede ver)

### 3.4 Ejecución y snapshots
- `NoveltyExecution`:
  - case (FK)
  - executed_by, executed_at
  - before_snapshot (JSON)
  - after_snapshot (JSON)
  - revert_of (FK opcional)

---

## 4) Reglas de negocio (checklist)

### 4.1 Validaciones duras mínimas
- Incompatibilidades: no permitir dos novedades activas incompatibles por estudiante.
- Idempotencia: no permitir “retiro” si ya está retirado; no permitir “ingreso” si ya activo; reingreso debe tener precondición.
- Fecha efectiva: validar contra último cambio y/o reglas por periodo.
- Cupos: validar disponibilidad en destino.
- Documentos: validar checklist obligatorio antes de aprobar/ejecutar.
- Integridad de historial: transiciones permitidas; no saltos ilegales.
- Restricciones administrativas: bloqueos por cierre de matrículas/notas.

### 4.2 Separación Tramitar vs Ejecutar
- Tramitar: radicar, adjuntar, revisar, aprobar.
- Ejecutar: aplicar cambios al core de manera transaccional.
- Revertir: rollback controlado con permisos + causal + auditoría.

---

## 5) Plan por sprints (metas chequeables)

Duración sugerida: 2 semanas por sprint.

### Sprint 0 — Descubrimiento técnico y especificación (1 semana)
**Meta:** dejar especificación lista para construir sin ambigüedades.

Checklist (Done cuando todo está marcado):
- [ ] Documento de reglas por tipo (Ingreso/Reingreso/Retiro/Traslado/Cambio interno) con precondiciones y efectos.
- [ ] Matriz de estados y transiciones permitidas (diagrama + tabla).
- [ ] Decisión final de “fuente de verdad” para jornada (Group.shift vs Campus.shifts).
- [ ] Decisión final de ejecución: manual “Ejecutar” (recomendado) vs auto al aprobar.
- [ ] Inventario de endpoints requeridos (crear caso, radicar, adjuntar, aprobar, ejecutar, revertir, reportes).

Entregables:
- Especificación funcional v1.
- Diseño del modelo (ERD) y estados.

---

### Sprint 1 — Scaffolding app + modelos base + permisos
**Meta:** crear `backend/novelties` con modelos y permisos listos, sin lógica compleja aún.

Checklist:
- [ ] App Django `novelties` creada con `apps.py`, `admin.py`, `models.py`, `serializers.py`, `views.py`, `urls.py`.
- [ ] `INSTALLED_APPS` actualizado y migraciones iniciales creadas.
- [ ] Router DRF montado bajo `/api/novelties-workflow/` (evita colisión con el endpoint legacy `/api/novelties/` en `students`).
- [ ] Permisos Django generados y bootstrap de roles actualizado (seed) para `novelties`.
- [ ] Modelos implementados: `NoveltyType`, `NoveltyReason`, `NoveltyCase`, `NoveltyCaseTransition`.
- [ ] Tests mínimos: crear caso, listar casos, permisos básicos (admin vs no admin).

Criterios de aceptación:
- API responde 200 para list/create con auth.
- Solo roles definidos pueden crear/ver según política.

---

### Sprint 2 — Workflow (estados), radicado y bitácora inmutable
**Meta:** que el caso tenga un flujo real (borrador→radicada→revisión→aprobación/rechazo), con consecutivo único.

Checklist:
- [ ] Implementar consecutivo/radicado único por institución y año (y pruebas de unicidad).
- [ ] Implementar máquina de estados (transiciones permitidas) con registro en `NoveltyCaseTransition`.
- [ ] Acciones API: `file/radicar`, `send_to_review`, `approve`, `reject`, `return_to_previous`.
- [ ] Observaciones por paso obligatorias donde aplique.
- [ ] “Pendiente de documentación” como estado real cuando falten soportes.
- [ ] Auditoría funcional: cada transición guarda actor, rol, timestamp, comentario.

Criterios de aceptación:
- No se puede saltar estados.
- Se puede devolver con trazabilidad.

---

### Sprint 3 — Adjuntos + checklist de documentos requeridos
**Meta:** soportes adjuntos con reglas por tipo/motivo y validación antes de aprobar/ejecutar.

Checklist:
- [ ] Modelos: `NoveltyRequiredDocumentRule`, `NoveltyAttachment`.
- [ ] Endpoint para subir/listar/eliminar adjuntos por caso con validación de formato/tamaño.
- [ ] Validación de checklist: bloquear “aprobar” y/o “ejecutar” si faltan obligatorios.
- [ ] Control de visibilidad por rol en adjuntos.
- [ ] Tests: adjunto obligatorio bloquea aprobación; visibilidad restringida.

Criterios de aceptación:
- Un caso puede quedar en `pending_docs` automáticamente.

---

### Sprint 4 — Motor de ejecución transaccional (MVP) + snapshots
**Meta:** ejecutar novedades que impacten core (estado/matrícula/grupo) de forma transaccional.

Checklist:
- [ ] Service layer `novelties/services/execution.py` (o similar) con `execute(case)`.
- [ ] Ejecución transaccional (`transaction.atomic`) para:
  - [ ] Retiro: inactivar/actualizar estado del estudiante y su matrícula activa.
  - [ ] Reingreso: reactivar estudiante + crear/activar matrícula según reglas.
  - [ ] Cambio interno: mover matrícula a grupo destino.
- [ ] Guardar snapshots before/after en `NoveltyExecution`.
- [ ] Endpoint `execute` (solo roles autorizados).
- [ ] Idempotencia por `idempotency_key` (reintentos no duplican cambios).
- [ ] Tests: ejecución cambia core; snapshots existen.

Criterios de aceptación:
- Si falla algo, no hay cambios parciales.
- Ejecutar 2 veces no duplica.

---

### Sprint 5 — Cupos multi-nivel + concurrencia
**Meta:** validar cupos de forma flexible (grupo y/o bucket) y evitar sobreasignación concurrente.

Checklist:
- [ ] Modelo `CapacityBucket` (sede+grado+jornada+año+modalidad opcional) + `GroupCapacityOverride`.
- [ ] Política implementada: si existe override de grupo úsalo; si no existe usa bucket; si existen ambos aplica el más restrictivo.
- [ ] Actualizar validaciones de destino en ejecución de novedades.
- [ ] Lock Redis por recurso durante ejecución (key por bucket/grupo).
- [ ] Tests: dos ejecuciones concurrentes no sobrepasan cupo.

Criterios de aceptación:
- El sistema nunca excede cupos bajo concurrencia.

---

### Sprint 6 — Reportes, bandejas, SLA y notificaciones
**Meta:** operación diaria por roles: pendientes, alertas y reportes exportables.

Checklist:
- [ ] Bandeja “pendientes” por rol (filtros por estado/tipo/fecha/sede/grado).
- [ ] Notificaciones in-app por eventos: radicada/devuelta/aprobada/rechazada/ejecutada.
- [ ] SLA: job periódico marca/alerta casos en revisión > X días.
- [ ] Reporte por rango de fechas y export CSV.
- [ ] Línea de tiempo por estudiante (historial de novedades consolidado).

Criterios de aceptación:
- Un coordinador ve su bandeja y recibe notificaciones.

---

### Sprint 7 — Frontend MVP (React)
**Meta:** UI usable para crear y tramitar casos con checklist y ejecución segura.

Checklist:
- [ ] Pantalla listado + filtros (tabla estilo existente).
- [ ] Wizard/form dinámico por tipo (campos según configuración).
- [ ] Resumen antes de radicar (checklist) + confirmaciones.
- [ ] Pantalla de revisión (adjuntos + checklist + acciones por rol).
- [ ] Botón “Ejecutar” con advertencias de impacto.

Criterios de aceptación:
- Flujo completo end-to-end para retiro y cambio interno.

---

### Sprint 8 — Reversión controlada + hardening
**Meta:** reversión segura, seguridad y consistencia operativa.

Checklist:
- [ ] Endpoint `revert` con permisos estrictos + causal obligatoria.
- [ ] Reversión transaccional basada en snapshot o lógica inversa validada.
- [ ] Auditoría reforzada (registro de IP/huella, motivo, actor).
- [ ] Endurecer reglas por periodos (p.ej. notas cerradas requieren proceso especial).
- [ ] Documentación operativa + runbook.

Criterios de aceptación:
- Revertir no deja inconsistencia (y queda auditado).

---

## 6) Riesgos y mitigaciones
- **Riesgo:** mezclar jornada de `Campus` vs `Group` causa inconsistencias.
  - Mitigación: decidir una fuente de verdad + migración/normalización.
- **Riesgo:** side-effects existentes en “novedades” actuales en `students`.
  - Mitigación: deprecación gradual + migración de historial o puente de lectura.
- **Riesgo:** concurrencia sin lock produce cupos negativos.
  - Mitigación: lock Redis + transacción + constraint lógico.

---

## 7) Definition of Done (DoD)
- Endpoints con permisos correctos.
- Transacciones y validaciones cubren escenarios principales.
- Tests automatizados para flujo y ejecución.
- Auditoría y notificaciones funcionando.
- UI mínima permite operación real.
- Documentación de configuración y operación.

---

## 8) Configuración y dependencias (por confirmar)
- Redis disponible (ya se usa para Celery): requerido para locks y/o contadores.
- Storage de adjuntos: definir si se usa `MEDIA_ROOT` o storage privado.
- Escoping por institución: confirmar si multi-tenant lógico (Institution) es requerido en esta fase.
