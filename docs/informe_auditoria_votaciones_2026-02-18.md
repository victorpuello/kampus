# Informe de Auditoría Técnica y Crítica
## Módulo de Votaciones — Kampus

**Fecha:** 2026-02-18  
**Auditoría realizada sobre:** backend + frontend + operación + pruebas del módulo electoral  
**Estado del código analizado:** rama de trabajo actual del repositorio `kampus`

---

## 1) Resumen ejecutivo

El módulo de votaciones está **funcional y usable en operación básica**, con fortalezas claras en:
- Flujo E2E de votación con token one-time.
- Restricción de acceso administrativo en endpoints sensibles.
- Registro de contingencias de reset de token con historial.
- Panel de monitoreo near-real y exportables de escrutinio.
- Suite de pruebas backend en estado verde (`27 tests OK`).

Sin embargo, la auditoría identifica brechas relevantes que deben corregirse para madurez institucional:

- **Riesgo crítico de gobernanza:** se puede crear jornada con estado `OPEN` sin pasar por el proceso de apertura formal en cero (bypass del control).
- **Riesgo alto de consistencia bajo concurrencia:** falta manejo explícito de colisiones/`IntegrityError` en envío de voto concurrente.
- **Riesgo alto de seguridad de sesión:** tokens JWT en `localStorage` (exposición ante XSS).
- **Riesgos operativos y de trazabilidad:** acciones críticas sin auditoría uniforme (apertura/censo/exportaciones/impresión/creación masiva de códigos).
- **Riesgos de rendimiento escalable:** consultas N+1 y ausencia de índices compuestos para cargas de monitoreo y prevalidación.

### Calificación global (criterio técnico-operativo)
- **Funcionalidad:** 8/10
- **Seguridad:** 6.5/10
- **Integridad transaccional:** 6.5/10
- **Escalabilidad/rendimiento:** 6/10
- **Observabilidad/auditoría:** 6/10
- **Testing/resiliencia:** 7/10

**Resultado global estimado:** **6.8/10 (apto para operación controlada, no óptimo para operación institucional de alta criticidad sin remediaciones prioritarias).**

---

## 2) Alcance y metodología

### Componentes auditados
- Backend: `backend/elections/models.py`, `serializers.py`, `views_public.py`, `views_management.py`, `permissions.py`, `urls.py`, `tests.py`.
- Frontend: `kampus_frontend/src/pages/VotingAccess.tsx`, `ElectionProcessesManage.tsx`, `ElectionCensusManage.tsx`, `ElectionTokenReset.tsx`, `ElectionLiveDashboard.tsx`, `services/elections.ts`, `services/api.ts`, `store/auth.ts`, rutas en `App.tsx`.
- Configuración relacionada: `backend/kampus_backend/settings.py`, `backend/verification/throttles.py`.
- Documentación de operación: `docs/Plan de votaciones.md`.

### Validaciones ejecutadas
- Backend: `python backend/manage.py test elections.tests` → **OK (27 tests)**.
- Frontend: `npm run lint` → **OK**.

### Criterios de auditoría
- Seguridad y control de acceso.
- Integridad de voto y consistencia transaccional.
- Riesgo de fraude/abuso y robustez operativa.
- Escalabilidad/rendimiento.
- Calidad de UX operativa y mantenibilidad.
- Cobertura de pruebas y capacidad de diagnóstico.

---

## 3) Hallazgos críticos y altos (prioridad inmediata)

## [C1] Bypass de apertura formal en cero
**Severidad:** Crítica  
**Evidencia:**
- `ElectionProcessCreateSerializer` permite crear jornada con `status=OPEN`.
- `ElectionProcessOpenAPIView` es quien implementa apertura formal y registro `ElectionOpeningRecord`.
- No existe garantía de que toda jornada abierta haya pasado por `open/`.

**Impacto:**
- Riesgo legal/auditable: una jornada puede operar abierta sin acta de apertura en cero.
- Debilita trazabilidad institucional y defensa ante impugnaciones.

**Recomendación (alta prioridad):**
1. En creación, forzar estado inicial `DRAFT` (backend) ignorando `OPEN` de cliente.
2. Permitir transición a `OPEN` solo por endpoint dedicado que exige certificación.
3. Agregar test específico de no-bypass.

---

## [A1] Concurrencia de envío de voto sin manejo explícito de colisión
**Severidad:** Alta  
**Evidencia:**
- `PublicSubmitVoteInputSerializer.save()` usa transacción y `bulk_create` con constraints únicas.
- En condiciones de doble submit simultáneo, puede disparar `IntegrityError` no mapeado a respuesta de negocio controlada.

**Impacto:**
- Respuestas 500 intermitentes bajo presión real (kioskos con doble clic/reintentos/red inestable).
- Dificultad de soporte en jornada.

**Recomendación:**
1. Capturar `IntegrityError` y responder 409/400 con mensaje determinístico.
2. Añadir test de colisión concurrente (pendiente en Sprint 5, ya reconocido en plan).
3. Definir idempotency key opcional para `submit-vote`.

---

## [A2] JWT en `localStorage`
**Severidad:** Alta  
**Evidencia:**
- `kampus_frontend/src/services/api.ts` y `store/auth.ts` almacenan `accessToken` y `refreshToken` en `localStorage`.

**Impacto:**
- Cualquier XSS efectivo compromete sesión administrativa y acciones críticas.

**Recomendación:**
1. Migrar a cookies `HttpOnly` + `Secure` + `SameSite`.
2. Endurecer CSP y sanitización para reducir superficie XSS.
3. Si transición gradual: reducir TTL de access token y reforzar monitoreo de sesión anómala.

---

## [A3] Trazabilidad incompleta en eventos críticos
**Severidad:** Alta  
**Evidencia:**
- Existe auditoría explícita en reset de token.
- No hay evidencia homogénea de auditoría en: apertura de jornada, cambios de censo por jornada, emisión masiva de códigos/QR, exportaciones de actas.

**Impacto:**
- Brecha forense: difícil reconstruir “quién-hizo-qué-cuándo” en incidentes.

**Recomendación:**
- Estandarizar auditoría para toda acción crítica electoral (usuario, IP, timestamp, payload reducido, resultado).

---

## [A4] Riesgo de rendimiento por consultas de elegibilidad y monitoreo
**Severidad:** Alta  
**Evidencia:**
- `ElectionTokenEligibilityIssuesAPIView` itera tokens y evalúa elegibilidad por token (patrón N+1 potencial).
- `build_live_dashboard_payload` consulta agregados frecuentes por `process`/`created_at`.
- No se observa índice compuesto explícito para `VoteRecord(process, created_at)`.

**Impacto:**
- Degradación en jornadas grandes (latencia panel live, tiempos altos en prevalidación).

**Recomendación:**
1. Añadir índices compuestos en `VoteRecord` orientados a queries reales.
2. Reescribir prevalidación masiva en bloques con joins/mapas en memoria y menos round-trips.
3. Considerar cache corta (5–15s) para snapshot live administrativo.

---

## 4) Hallazgos medios

## [M1] Lógica de elegibilidad demasiado permisiva cuando falta identidad fuerte en token
**Evidencia:**
- Si token no trae identidad asociable (`student_external_id`/`document_number`), se valida por coincidencia de scope general (grado/jornada).

**Riesgo:**
- Debilita vínculo token↔estudiante específico, especialmente si se emiten códigos manuales sin controles adicionales.

**Mejora recomendada:**
- Exigir identidad verificable para producción (al menos `student_external_id` firmado/validado).

---

## [M2] Emisión de códigos manuales y QR provoca revocaciones/regen sin guardas operativas fuertes
**Evidencia:**
- Export/print generan códigos y revocan activos previos por estudiante en cada ejecución.

**Riesgo:**
- Reimpresiones repetidas pueden causar confusión operacional o anular códigos ya distribuidos.

**Mejora:**
- Confirmación explícita con “modo regenerar” vs “modo solo listar existentes”, más auditoría obligatoria.

---

## [M3] Monitoreo live depende de polling periódico
**Evidencia:**
- `ElectionLiveDashboard.tsx` usa polling cada 8s, con modo incremental.

**Riesgo:**
- Escala peor que SSE/WebSocket en múltiples operadores; más carga backend en picos.

**Mejora:**
- Completar evaluación SSE planificada; fallback a polling cuando no disponible.

---

## [M4] Dependencia frágil de WeasyPrint en entorno
**Evidencia:**
- En test aparece advertencia de librerías externas de WeasyPrint.

**Riesgo:**
- En servidores mal aprovisionados, export PDF puede fallar en operación.

**Mejora:**
- Checklist de preflight de dependencias nativas + endpoint de healthcheck específico para PDF.

---

## [M5] Cobertura frontend sin pruebas automatizadas de flujos electorales críticos
**Evidencia:**
- Lint en verde, pero no se evidencian tests de UI/E2E para voto, contingencia y monitoreo.

**Riesgo:**
- Regresiones de comportamiento en hooks/estado detectadas tarde (ej. loop reciente).

**Mejora:**
- Añadir al menos smoke tests E2E (Playwright/Cypress) para rutas críticas.

---

## 5) Fortalezas destacables

1. Arquitectura de dominio electoral clara y cohesionada.
2. Restricciones de negocio importantes ya implementadas (roles electorales, grados, voto único por token/rol).
3. Buen avance en operación institucional (censo sincronizado, prevalidación, actas, monitoreo).
4. Control de permisos backend consistente para administración electoral.
5. Respuesta del equipo ágil ante incidentes (loop en dashboard corregido y validado).

---

## 6) Matriz de priorización (qué hace falta y qué mejorar)

## Prioridad P0 (0–7 días)
- Bloquear creación de jornada en `OPEN` por endpoint de creación.
- Fortalecer `submit-vote` con manejo explícito de colisiones concurrentes.
- Activar auditoría completa para apertura/censo/exportaciones/códigos.
- Definir runbook de contingencia para regeneración de códigos manuales.

## Prioridad P1 (1–3 semanas)
- Índices y optimización de queries live/prevalidación.
- Reforzar elegibilidad para exigir identidad trazable del votante.
- Pruebas de carga básicas sobre `validate-token`, `submit-vote`, `live-dashboard`.
- Healthcheck operativo de PDF (dependencias WeasyPrint).

## Prioridad P2 (3–6 semanas)
- Migración progresiva de JWT en `localStorage` a cookies `HttpOnly`.
- Evaluación/implementación SSE para live dashboard.
- E2E frontend de flujos electorales de mayor riesgo.

---

## 7) Recomendación de plan de remediación 30/60/90

## 30 días
- Cerrar todos los P0.
- Agregar pruebas backend de concurrencia y no-bypass de apertura.
- Aumentar trazabilidad operativa y checklist de jornada.

## 60 días
- Ejecutar optimizaciones de rendimiento y observabilidad de métricas.
- Endurecer elegibilidad vinculada a identidad.
- Implementar smoke E2E frontend de votación y monitoreo.

## 90 días
- Completar migración de sesión segura (cookies `HttpOnly`) o mitigación equivalente aprobada.
- Evaluar SSE en producción con fallback y alarmas.
- Cerrar deuda técnica restante de censo/manual codes.

---

## 8) Conclusión

La app de votaciones está **bien encaminada y funcional**, pero para una operación institucional robusta requiere cerrar brechas en tres ejes: **gobernanza de apertura**, **consistencia bajo concurrencia**, y **seguridad/forensia operativa**.

Si se ejecuta el plan P0/P1 propuesto, el módulo puede pasar de “operación controlada” a “operación confiable y auditable” con un salto significativo de madurez.

---

## 9) Evidencia de verificación técnica ejecutada durante esta auditoría

- Backend tests: `python backend/manage.py test elections.tests` → **27 pruebas OK**.
- Frontend quality gate: `npm run lint` → **sin errores**.

---

## 10) Plan de acción por sprint (cadencia de 1 semana)

> Objetivo: cerrar los hallazgos críticos/altos del informe primero, y luego consolidar seguridad, rendimiento y calidad operativa.

### Sprint 1 (Semana 1) — Gobernanza y consistencia transaccional (P0)
**Objetivo:** eliminar bypass de apertura y evitar errores 500 por colisiones de voto.

**Tareas:**
- Forzar creación de jornada en `DRAFT` desde backend (ignorar `OPEN` en create).
- Mantener transición a `OPEN` solo por endpoint formal de apertura en cero.
- Manejar `IntegrityError` en envío de voto y devolver error de negocio controlado (`409`/`400`).
- Añadir pruebas: no-bypass de apertura + colisión de envío concurrente.

**Entregables:**
- Código backend remediado + tests verdes.
- Nota de release interna con cambio de contrato de creación.

**Criterio de cierre:**
- No es posible crear jornadas abiertas sin registro de apertura.
- No aparecen 500 por doble submit en pruebas de concurrencia.

---

### Sprint 2 (Semana 2) — Auditoría integral de eventos críticos (P0)
**Objetivo:** garantizar trazabilidad forense completa de acciones sensibles.

**Tareas:**
- Estandarizar auditoría para: apertura de jornada, exclusión/inclusión de censo, generación de códigos manuales/QR, exportaciones de actas.
- Definir esquema común de evento (actor, rol, IP, timestamp, recurso, resultado, metadata mínima).
- Incluir IDs de correlación para facilitar investigación de incidentes.
- Ajustar runbook operativo con pasos de verificación de auditoría.

**Entregables:**
- Eventos auditables homogéneos en backend.
- Runbook actualizado y usable por coordinación/soporte.

**Criterio de cierre:**
- Cada acción crítica deja rastro auditable verificable.
- El equipo puede reconstruir una línea de tiempo de jornada completa.

---

### Sprint 3 (Semana 3) — Rendimiento de monitoreo y prevalidación (P1)
**Objetivo:** reducir latencia y carga en jornadas con alto volumen.

**Tareas:**
- Crear índices compuestos en `VoteRecord` (incluyendo `process` + `created_at` y/o combinaciones usadas por queries reales).
- Optimizar `ElectionTokenEligibilityIssuesAPIView` para disminuir patrón N+1.
- Aplicar cache corta al snapshot live administrativo (TTL 5–15s).
- Medir tiempos antes/después en endpoints críticos.

**Entregables:**
- Migraciones de índices aplicadas.
- Endpoints optimizados con métricas comparativas.

**Criterio de cierre:**
- Mejora de latencia observable en `live-dashboard` y prevalidación.
- Sin regresiones funcionales en suite de pruebas.

---

### Sprint 4 (Semana 4) — Seguridad de sesión y hardening (P1/P2)
**Objetivo:** reducir exposición de sesión administrativa y superficie de ataque.

**Tareas:**
- Diseñar e implementar transición de JWT en `localStorage` a cookies `HttpOnly` (`Secure`, `SameSite`).
- Ajustar frontend y backend para refresh/auth compatibles con cookie-based flow.
- Endurecer políticas de seguridad web (CSP y prácticas anti-XSS donde aplique).
- Definir estrategia de migración gradual y rollback.

**Entregables:**
- Flujo auth endurecido en entorno de staging.
- Checklist de seguridad de sesión aprobado.

**Criterio de cierre:**
- Tokens no expuestos en `localStorage` para usuarios migrados.
- Login/refresh/logout estables en pruebas manuales y de regresión.

---

### Sprint 5 (Semana 5) — Integridad de elegibilidad y operación de códigos (P1)
**Objetivo:** reforzar vínculo token↔votante y controlar regeneraciones operativas.

**Tareas:**
- Endurecer elegibilidad para exigir identidad verificable en operación productiva.
- Separar claramente “listar códigos existentes” vs “regenerar códigos” con confirmación explícita.
- Registrar motivo obligatorio y auditoría para regeneración masiva.
- Ajustar UX operativa para minimizar errores de jurados/coordinadores.

**Entregables:**
- Reglas de elegibilidad más estrictas activables por configuración.
- Flujo de códigos manuales con guardas operativas.

**Criterio de cierre:**
- No hay regeneraciones accidentales sin confirmación y auditoría.
- Tokens emitidos con trazabilidad de identidad más sólida.

**Estado de ejecución (2026-02-19):**
- ✅ Ajuste de comportamiento en backend para operación en servidor: el modo `existing` de exportación/impresión de códigos manuales ahora reutiliza códigos activos existentes y genera códigos para faltantes, sin revocar códigos válidos previos.
- ✅ Ajuste de UX operativa en frontend: etiqueta del modo actualizada a “Reusar existentes y generar faltantes (sin regenerar)”.

---

### Sprint 6 (Semana 6) — Calidad, observabilidad y cierre de deuda (P2)
**Objetivo:** estabilizar el módulo con pruebas end-to-end y monitoreo continuo.

**Tareas:**
- Incorporar smoke E2E frontend para flujos críticos: acceso/voto, contingencia, monitoreo live.
- Añadir healthcheck operativo para pipeline PDF (dependencias WeasyPrint).
- Definir tablero de KPIs técnicos (errores 4xx/5xx, latencia, colisiones, eventos auditables).
- Evaluar piloto SSE (si viable) con fallback a polling.

**Entregables:**
- Suite mínima E2E integrada en CI.
- Healthcheck y dashboard operativo de métricas.

**Criterio de cierre:**
- Regresiones críticas detectadas automáticamente.
- Operación con señales tempranas de degradación/incidente.

**Estado de ejecución (2026-02-18):**
- ✅ Healthcheck PDF operativo implementado en `/api/reports/health/pdf/` (admin-only, respuesta `200/503/500` según estado del motor de render).
- ✅ KPIs técnicos agregados al monitoreo live (ventana 24h): eventos auditados, errores 4xx/5xx, tasa de fallo, submits, duplicados y regeneraciones manuales.
- ✅ Instrumentación de auditoría pública para diferenciar `ELECTION_VOTE_SUBMIT` vs `ELECTION_VOTE_SUBMIT_DUPLICATE`.
- ✅ Smoke E2E frontend integrado con Playwright (config local + workflow CI).

**Evidencia de validación Sprint 6:**
- Backend: `python backend/manage.py test elections.tests reports.tests` → **49 pruebas OK** (`2 skipped` por dependencia de WeasyPrint en entorno local).
- Frontend lint: `npm run lint` → **OK**.
- E2E smoke local: `npm run e2e:smoke` → **3/3 pruebas OK** (`E2E_EXIT_CODE:0`).

**Notas operativas:**
- En entorno local se mantiene advertencia de librerías nativas WeasyPrint; en Docker/servidor aprovisionado debe validarse con el endpoint de healthcheck antes de jornada.
- Node local actual (`22.11.0`) ejecuta la suite smoke, pero Vite recomienda `22.12+` para eliminar warnings de engine.

---

## 11) Dependencias y responsables sugeridos

### Dependencias clave
- Aprobación institucional de política de apertura formal en cero.
- Ventana controlada para migración de sesión (cookies `HttpOnly`).
- Entorno staging con datos representativos para pruebas de carga.

### Responsables sugeridos (RACI simplificado)
- **Backend líder:** Sprints 1, 2, 3, 5.
- **Frontend líder:** Sprints 4, 5, 6.
- **DevOps/Infra:** Sprint 4 y 6 (seguridad de sesión, healthchecks, métricas).
- **QA/Operación académica:** validación de criterios de cierre por sprint.

---

## 12) Indicadores de éxito del plan

- 0 jornadas abiertas por bypass de creación.
- 0 errores 500 por concurrencia de voto en pruebas controladas.
- 100% de acciones críticas con evento de auditoría trazable.
- Reducción medible de latencia en `live-dashboard` y prevalidación.
- Cobertura E2E mínima en flujos críticos antes de siguiente jornada institucional.

