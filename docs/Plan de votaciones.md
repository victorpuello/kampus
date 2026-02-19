## Plan de trabajo: Votaciones Gobierno Escolar (Actualizado)

Última actualización: 2026-02-19

### 1) Estado actual del proyecto
- Se construyó el módulo electoral base en backend y frontend.
- La votación pública en `/votaciones` está operativa con token one-time.
- La contingencia para jurados/administradores (reset de token con auditoría) está operativa.
- El dominio electoral quedó acotado a Personería y Contraloría.

---

### 2) Tareas completadas

#### Backend
- [x] Crear app `elections` e integrarla en rutas del proyecto.
- [x] Implementar modelos núcleo (`ElectionProcess`, `ElectionRole`, `VoterToken`, `VoteAccessSession`, `VoteRecord`, `TokenResetEvent`).
- [x] Implementar endpoints públicos:
  - [x] Validación de token de votación.
  - [x] Envío de voto por sesión.
- [x] Implementar contingencia:
  - [x] Reset de token con motivo obligatorio.
  - [x] Auditoría del evento de reset.
  - [x] Historial de resets.
- [x] Restringir cargos a Personería y Contraloría.
- [x] Implementar reglas de grado para candidaturas:
  - [x] Personería: grado 11 (último grado ofrecido).
  - [x] Contraloría: grados 6 a 11.
- [x] Migraciones aplicadas y check de Django en verde.

#### Frontend
- [x] Publicar flujo de votación en `/votaciones`.
- [x] Implementar landing, acceso por QR/código manual, tarjetones, revisión y confirmación.
- [x] Integrar frontend con API real de `elections`.
- [x] Crear UI de contingencia en `/votaciones/reset-token` para roles autorizados.
- [x] Mostrar historial de resets en UI administrativa.
- [x] Crear menú `Gobierno Escolar` y submenús administrativos.
- [x] Implementar pantallas de gestión centralizadas:
  - [x] Jornadas (`/gobierno-escolar/procesos`).
  - [x] Pestaña interna `Cargos` dentro de Jornadas.
  - [x] Pestaña interna `Candidatos` (Personería/Contraloría) dentro de Jornadas.
- [x] Simplificar navegación: retirar accesos separados de Cargos/Candidatos del menú y del router.
- [x] Corregir warning de anidamiento inválido de botones en tarjetones.
- [x] Unificar etiquetas amigables (Personería/Contraloría y candidatura).

#### Operación
- [x] Crear comando `seed_election_demo`.
- [x] Exportar y actualizar tokens demo en `docs/election_demo_tokens.csv`.
- [x] Validar flujo end-to-end de token -> voto -> invalidación del token.
- [x] Validar flujo administrativo end-to-end (JWT admin -> crear jornada -> crear cargos -> crear candidaturas -> abrir jornada).
- [x] Limpiar datos demo de base de datos (jornadas `Jornada E2E*` y cargos/candidaturas demo remanentes).

---

### 3) Decisiones vigentes
- Identidad de votante: token/QR one-time.
- Privacidad: secreto operativo (trazabilidad de participación sin exponer selección nominal por estudiante).
- Censo: API institucional (aún pendiente de integración formal).
- Contingencia: exclusiva para jurados/administradores con motivo y auditoría.

---

### 4) Sprints redefinidos

## Sprint 1 — Base electoral y UX pública (CERRADO)
**Objetivo:** habilitar votación funcional mínima de punta a punta.

**Entregables logrados:**
- Rutas y servicios backend/frontend de votación.
- Flujo completo de estudiante en `/votaciones`.
- Registro de voto único por cargo y consumo de token.

**Resultado:** ✅ Completado.

## Sprint 2 — Gobierno operativo y reglas electorales (CERRADO)
**Objetivo:** robustecer operación y cumplimiento funcional interno.

**Entregables logrados:**
- Reset de token con auditoría e historial.
- Reducción de cargos a Personería/Contraloría.
- Validaciones de grado por candidatura.
- Homologación de mensajes y etiquetas.
- Menú administrativo `Gobierno Escolar` simplificado y gestión consolidada en `Jornadas` con pestañas para cargos y candidaturas.

**Resultado:** ✅ Completado.

## Sprint 3 — Censo institucional y apertura formal (EN CURSO)
**Objetivo:** cerrar brecha de operación real con datos institucionales.

**Alcance:**
- [x] Integrar base de sincronización con API institucional mediante `source-url` en comando `sync_election_census` (adapter HTTP + token/headers/timeout).
- [x] Implementar base de sincronización de censo con comando `sync_election_census` en modo `dry-run/apply` usando archivo JSON.
- [x] Definir reconciliación (altas/bajas/cambios) y trazabilidad en `docs/especificacion_reconciliacion_censo_v1.md`.
- [x] Incorporar validaciones de elegibilidad por censo sincronizado en `validate-token` y `submit-vote`.
- [x] Documentar runbook operativo de jornada (apertura, contingencia, cierre) en `docs/runbook_jornada_votaciones_gobierno_escolar.md`.

- [x] Sincronización automática de censo electoral por matrículas activas (`Enrollment`) implementada y operativa vía scheduler (`backend_scheduler`).
- [x] Variables de entorno y documentación actualizadas para control de modo, intervalo y vigencia.

**Criterio de aceptación:**
- Censo sincronizado y verificable antes de abrir jornada.

**Avance adicional de control preventivo:**
- [x] Endpoint de revisión previa de elegibilidad de tokens: `/api/elections/manage/tokens/eligibility-issues/` (filtrable por `process_id`).
- [x] UI de prevalidación de censo en `Jornadas` (selector de jornada, ejecución de validación, tabla de incidencias).
- [x] Exportación CSV de incidencias de prevalidación desde la UI de `Jornadas`.

## Sprint 4 — Escrutinio, actas y cierre de jornada (CERRADO)
**Objetivo:** completar ciclo electoral institucional.

**Alcance:**
- [x] Implementar apertura en cero verificable (registro auditable en `ElectionOpeningRecord` + endpoint `/api/elections/manage/processes/{id}/opening-record/`).
- [x] Implementar totalización/escrutinio base por cargo (incluye voto en blanco) en endpoint `/api/elections/manage/processes/{id}/scrutiny-summary/`.
- [x] Generar exportables de acta de escrutinio en CSV y Excel (`/scrutiny-export.csv` y `/scrutiny-export.xlsx`).
- [x] Generar acta PDF usando infraestructura de reportes.
- [x] Publicar vista administrativa de apertura en cero y resultados base en `Jornadas` (consulta y tabla por cargo/candidatos).

**Criterio de aceptación:**
- Cierre de jornada con resultados auditables y actas descargables.

**Resultado:** ✅ Completado.

## Sprint 5 — Endurecimiento y piloto institucional (EN CURSO)
**Objetivo:** preparar salida estable para operación real.

**Alcance:**
- [x] Base de pruebas E2E backend para jornada electoral completada en `backend/elections/tests.py`.
- [x] Cobertura de flujo público principal: validación de token, envío de voto y consumo de token.
- [x] Cobertura de contingencia: reset de token con reactivación y validación de permisos por rol.
- [x] Cobertura de validaciones críticas: token expirado, revocado, jornada fuera de ventana y bloqueo por censo.
- [x] Cobertura de escrutinio y exportables: summary, CSV, XLSX y PDF (incluye rutas 200/503/500 con mocks para PDF).
- [x] Cobertura de autorización en endpoints de gestión/exportación (401/403 para summary y exportables CSV/XLSX/PDF).
- [x] Corrección operativa en servidor: modo `existing` de códigos manuales ahora reutiliza existentes y genera faltantes (sin revocar activos).
- [ ] Cobertura específica de concurrencia (envío simultáneo/colisión de sesión) pendiente de incluir.
- [ ] Ajustes finales de seguridad y retención de datos.
- [ ] Validación en piloto controlado (tablet/celular/red intermitente).

**Criterio de aceptación:**
- Piloto exitoso con evidencia técnica y operativa.

## Sprint 6 — Monitoreo en vivo administrativo (EN CURSO · MVP VALIDADO)
**Objetivo:** habilitar panel near-real para seguimiento operativo de la jornada.

**Alcance:**
- [x] Endpoint live snapshot en backend: `/api/elections/manage/processes/{id}/live-dashboard/`.
- [x] Control de acceso ADMIN/SUPERADMIN (backend + frontend).
- [x] KPIs operativos en payload: total votos, participación sobre censo habilitado, % blanco y votantes únicos.
- [x] Ranking por cargo/candidatos y serie temporal por minuto.
- [x] Alertas por reglas fijas (inactividad, pico de votación, % blanco alto).
- [x] Página dedicada de monitoreo en frontend: `/gobierno-escolar/monitoreo`.
- [x] Polling near-real en UI (8s) con actualización manual.
- [x] Umbrales configurables vía query params y controles UI (`window_minutes`, `blank_rate_threshold`, `inactivity_minutes`, `spike_threshold`, `series_limit`).
- [x] Optimización incremental de payload (delta-only / since cursor).
- [ ] Evaluación de migración a SSE en fase posterior.

**Criterio de aceptación:**
- Operadores administrativos visualizan estado de jornada en tiempo casi real y pueden ajustar umbrales de alertas sin despliegue.

**Evidencia técnica (2026-02-18):**
- [x] Healthcheck PDF operativo: `/api/reports/health/pdf/` (admin-only).
- [x] KPIs técnicos agregados en dashboard live (24h): eventos auditados, 4xx/5xx, tasa de fallo, duplicados, regeneraciones.
- [x] Instrumentación de eventos `ELECTION_VOTE_SUBMIT` y `ELECTION_VOTE_SUBMIT_DUPLICATE`.
- [x] Smoke E2E frontend con Playwright (local + workflow CI) ejecutado en verde (`3/3`).
- [ ] Pendiente: piloto SSE/fallback en entorno real para evaluación de escalamiento final.

---

### 5) Verificación recomendada por sprint
- Backend: `python backend/manage.py test` y `python backend/manage.py check`.
- Frontend: `cd kampus_frontend && npm run lint`.
- Operación: simulación controlada de jornada y contingencia con tokens demo.
