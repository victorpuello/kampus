# Informe ejecutivo — Mejoras mediadas por IA para Kampus (Backend + Frontend)

Fecha: 2026-01-17  
Alcance: monorepo Kampus (Django REST en `backend/` + SPA React/TS en `kampus_frontend/`).

---

## 1) Resumen ejecutivo (para decisión)

Kampus ya cuenta con una base sólida (DRF + JWT, módulos por dominio, reportes PDF, auditoría y primeras capacidades de IA con Gemini). El mayor salto en eficiencia y robustez se obtiene al:

1) **Estandarizar una “Plataforma IA”** (gobierno de datos, seguridad/PII, observabilidad, colas, caché, rate limiting) para que las funciones IA no sean endpoints aislados.
2) **Potenciar la UX con IA “contextual y segura”** (copiloto docente/coord., sugerencias en planilla, explicaciones accionables y búsquedas semánticas) reduciendo fricción y tiempo operativo.
3) **Hacer la IA confiable** (validación, cache/control de costos, fallback, evaluación continua, “human-in-the-loop”) evitando alucinaciones y riesgo reputacional.

Impacto esperado (estimado):
- **-20% a -40%** tiempo de tareas repetitivas (planeación/indicadores/redacción/reportes).
- **+15% a +30%** completitud de calificaciones y consistencia de registros (por asistencia y nudges inteligentes).
- **Menos incidentes** por fallas transitorias y menos “logout” injustificados; diagnósticos más rápidos.

---

## 2) Estado actual (evidencia en el repo)

### 2.1 Arquitectura
- Backend: Django 5 + DRF, apps por dominio (`academic`, `students`, `teachers`, `discipline`, `audit`, etc.).
- Auth: SimpleJWT (`POST /api/token/`, `POST /api/token/refresh/`).
- Frontend: React 18 + TypeScript + Vite, estilo Tailwind + componentes.
- Scheduler: servicio `backend_scheduler` en `docker-compose.yml` que ejecuta loops de comandos de Django (descargos y cierres de asistencia).

### 2.2 IA ya implementada
- Servicio IA actual: `backend/academic/ai.py`.
  - Proveedor: Gemini (`google.generativeai`), modelo configurado como `gemini-2.5-flash`.
  - Casos actuales:
    - `improve_text(text)`: mejora de redacción.
    - `generate_indicators(description)`: genera indicadores por nivel (LOW/BASIC/HIGH/SUPERIOR) en JSON.
    - `analyze_group_state(context)`: informe ejecutivo del estado del grupo (texto estructurado).
- Endpoints expuestos:
  - `academic.views.AchievementViewSet`: acciones `generate-indicators` y `improve-text` (con control por rol).
  - `teachers.views.TeacherViewSet`: `GET /api/teachers/me/statistics/ai` y `GET /api/teachers/me/statistics/ai/pdf`.
  - Existe cache/almacenamiento de análisis IA en `TeacherStatisticsAIAnalysis` (robusto para costo/latencia).

### 2.3 Riesgos actuales (oportunidades)
- IA con PII: hay intención explícita de usar contexto agregado (bien), pero falta un **mecanismo unificado de redacción/filtrado de PII** antes de salir al proveedor.
- “Scheduler” por loops en shell: funcional, pero limitado para trazabilidad/reintentos y observabilidad.
- Observabilidad: logging existe, auditoría existe, pero falta trazas/métricas para aislar cuellos de botella (PDF, endpoints pesados, IA).

---

## 3) Objetivos 2026 (eficiencia + robustez)

**Eficiencia operativa**
- Reducir tiempo en planeación, elaboración de indicadores, redacción, generación de informes y análisis de desempeño.

**Robustez técnica**
- Disminuir fallas intermitentes, mejorar diagnósticos, introducir colas y cache coherente.

**Confiabilidad pedagógica**
- IA útil, verificable y alineada al SIEE, sin inventar datos.

**Seguridad y cumplimiento (PII de menores)**
- Minimización de datos, control de accesos, auditoría, retención y consentimiento.

---

## 4) Propuesta: Plataforma IA (backend) — “hacer la IA operable”

Estas medidas hacen que cualquier feature IA sea **predecible, controlable y escalable**.

### 4.1 Unificar un “Kampus AI Gateway”
Crear una capa común para todas las llamadas IA:
- Selección de proveedor/modelo por configuración (feature flags).
- Rate limiting por usuario/rol/endpoint.
- Cache por hash de contexto + versión de prompt.
- Validación de salida (JSON schema cuando aplica).
- Fallback (p.ej., modelo alterno o modo sin IA).

**Dónde encaja**: evolucionar `backend/academic/ai.py` a un módulo común (p.ej. `backend/core/ai/` o `backend/ai/`) sin acoplarlo a `academic`.

### 4.2 Gobierno de prompts
- Versionar prompts (p.ej. `PROMPT_VERSION=2026-01`), registrar en DB y en auditoría.
- Plantillas por rol: TEACHER vs COORDINATOR vs ADMIN.
- “Guías del dominio”: SIEE, escalas, conceptos institucionales.

### 4.3 Redacción y minimización de PII (obligatorio)
- Implementar un pre-procesador que:
  - Detecte y elimine nombres, documentos, teléfonos, emails, direcciones.
  - Reemplace con placeholders (`ESTUDIANTE_01`, etc.).
  - Solo permita agregados (conteos, promedios, distribución, sin filas por estudiante) en prompts externos.

### 4.4 Observabilidad IA
- Estructurar logs y métricas:
  - `ai_request_count`, `ai_error_rate`, `ai_latency_ms`, `ai_tokens_estimated`, `ai_cache_hit_rate`.
  - Correlation IDs por request.
- Registrar en auditoría eventos sensibles: “generó informe IA”, “descargó PDF IA”.

### 4.5 Ejecución asíncrona (colas)
IA y PDFs son candidatos a jobs en background:
- Migrar tareas pesadas a cola (Celery/RQ) + worker.
- Para UX: el frontend recibe un `job_id`, hace polling o SSE/WS.

Beneficios:
- Evita timeouts.
- Permite reintentos.
- Evita bloquear el request/response.

---

## 5) Mejoras IA (backend) — casos de uso de alto impacto

### 5.1 “Copiloto de planeación” (logros → indicadores → actividades)
- Entrada: logro + área/materia + grado + periodo.
- Salida: indicadores por nivel, actividades sugeridas, rúbrica base.
- Integración con flujo actual (logros/indicadores ya existe).

### 5.2 “Coherencia SIEE” (validador inteligente)
- Detecta inconsistencias:
  - Indicadores desalineados con el logro.
  - Descriptores repetidos o demasiado genéricos.
  - Uso de verbos no observables.
- Devuelve sugerencias y un score de calidad.

### 5.3 Detección de anomalías en calificaciones
- Señala:
  - Distribuciones extrañas (picos, todo 1.0 o todo 5.0).
  - Cambios masivos en poco tiempo.
  - Cobertura baja en planilla.
- Enfatizar que es “alerta”, no juicio.

### 5.4 Resúmenes automáticos de convivencia (discipline)
- Para casos: generar resumen ejecutivo, timeline de evidencias, y borrador de comunicación.
- Con reglas: no inventar hechos, usar solo datos del caso y adjuntos metadata.

### 5.5 Asistente de comunicaciones
- Plantillas adaptativas para:
  - Notificaciones a acudientes.
  - Recordatorios de descargos.
  - Comunicaciones por bajo desempeño.

---

## 6) Mejoras IA (frontend UX) — copiloto contextual y UX predictiva

### 6.1 Copiloto contextual por pantalla
Un panel lateral (drawer) que:
- Lee el contexto de la vista (grupo, periodo, materia, rol).
- Sugiere acciones rápidas y explica métricas.
- Permite “preguntas” con botones guiados (no chat libre en primera fase).

Ejemplos:
- En `Grades` (planilla):
  - “Generar indicadores para este logro” (usa endpoint existente).
  - “Sugerir observaciones para boletín según desempeño agregado”.
  - “Detectar estudiantes en riesgo (agregado)” y proponer plan de acción.
- En `TeacherStatistics`:
  - “Actualizar análisis IA” (ya existe `refresh`).
  - “Convertir recomendaciones en checklist semanal”.

### 6.2 Autocompletado inteligente en formularios
- Logros/indicadores: sugerencias de redacción, corrección de estilo.
- Casos disciplinarios: sugerencia de “hechos” vs “interpretaciones” (separar hechos de opiniones).

### 6.3 Búsqueda semántica (UX)
- Buscar estudiantes, casos, reportes y configuraciones por intención:
  - “casos sin descargo”, “grupo con más riesgo”, “boletín periodo 2 grado 7”.
- Backend: índice (Postgres full-text o vector store si se autoriza).

### 6.4 “Nudges” y recomendaciones accionables
- En planilla:
  - Cobertura: mostrar “faltan X celdas”, sugerir bloques por completar.
  - Detección de outliers: marcar sin bloquear.
- En reportes:
  - “Antes de generar PDF: faltan datos en 3 asignaturas” (evita reprocesos).

### 6.5 Experiencia robusta (degradación)
- Si IA falla (502 / sin key):
  - UI mantiene flujo y muestra “modo sin IA”.
  - Reintento y “guardar borrador” local.

---

## 7) Habilitadores no-IA (imprescindibles para robustez)

### 7.1 Observabilidad end-to-end
- Backend: logging estructurado + trazas (OpenTelemetry) + captura de errores (Sentry o equivalente).
- Frontend: error boundaries + logging de errores + métricas de UX (tiempo a interactivo, fallas de API, etc.).

### 7.2 Caching y performance
- Cache para endpoints pesados y para consultas de configuración estable.
- ETags/If-None-Match en listados grandes.

### 7.3 Colas para background jobs
- Sustituir loops del scheduler por un sistema de jobs (con reintentos/estado).

### 7.4 Rate limiting y protección
- Throttling DRF por rol y por endpoints de IA.
- Límites de tamaño de payload.

### 7.5 Seguridad y cumplimiento
- Revisar permisos para reportes (PDF, IA, exportaciones).
- Auditoría ampliada para acciones sensibles.
- Retención de logs con PII minimizada.

### 7.6 Calidad y pruebas
- Agregar pruebas para endpoints IA con mocks del proveedor.
- Tests de permisos por rol (ya existe un patrón en tests).

---

## 8) Roadmap priorizado

### Quick wins (1–2 semanas)
1) **Feature flags** para IA (activar/desactivar por institución/rol) + mensaje UX “modo sin IA”.
2) **Limiter + cache** para `generate-indicators` y `me/statistics/ai` (control de costo).
3) **PII guardrails**: bloqueos básicos (no permitir prompts con nombres/documentos) + redacción inicial.
4) **Observabilidad mínima IA**: logs + métricas + auditoría de uso.
5) UX: en `TeacherStatistics` y `Grades`, botones guiados “IA” con fallback y reintento.

### Iniciativas (1–3 meses)
1) **Kampus AI Gateway** completo (plantillas, versionado de prompts, validación de salida).
2) **Jobs asíncronos** para PDFs pesados y análisis IA; status en UI.
3) **Copiloto contextual** (drawer) con flujos guiados por rol.
4) **Detección de anomalías** (calificaciones/cobertura) + panel de alertas.
5) **Búsqueda semántica** (fase 1: Postgres FTS; fase 2: vector search si aplica).

### Horizonte (3–6 meses)
1) **Evaluación continua de IA** (dataset de prompts/respuestas anonimizadas + scoring).
2) **RAG institucional** (reglamentos, SIEE institucional, plantillas) con control de acceso.
3) **Recomendador pedagógico** con trazabilidad (por qué sugiere algo) y aprobación humana.

---

## 9) KPIs y métricas de éxito

### Operación y performance
- Latencia p95 endpoints críticos (planilla, reportes, IA).
- Tasa de error (4xx/5xx), especialmente 401/403 y 502 de IA.
- Cache hit rate (IA y endpoints pesados).

### UX
- Tiempo promedio para: crear logro + indicadores + actividades.
- Cobertura de planilla (% celdas llenas antes del cierre del periodo).
- Adopción de features IA: % usuarios que usan IA / semana.

### Pedagógico (con cuidado)
- Reducción de “riesgo” agregado (sin atribuir causalidad directa a IA).
- Mejora en consistencia de descriptores (menos duplicados, más específicos).

### Seguridad
- Eventos de acceso/descarga a reportes sensibles.
- Incidentes por exposición de PII (objetivo: 0).

---

## 10) Riesgos, ética y mitigaciones (prioridad alta)

1) **PII de menores** (máxima sensibilidad)
   - Mitigación: minimización, redacción, roles, auditoría, retención limitada, cifrado en reposo y tránsito.
2) **Alucinaciones / recomendaciones incorrectas**
   - Mitigación: IA solo con datos provistos, validación, disclaimers cortos, aprobación humana, prompts con restricciones (ya hay buenas reglas en `analyze_group_state`).
3) **Costo y dependencia de proveedor**
   - Mitigación: cache, rate limit, fallback, jobs asíncronos, posibilidad de “modo local” futuro.
4) **Sesgo**
   - Mitigación: no inferir atributos sensibles, usar métricas agregadas, supervisión pedagógica.

---

## 11) Backlog técnico sugerido (archivos/puntos de integración)

Backend (puntos evidentes por el código actual):
- `backend/academic/ai.py` (converger hacia gateway común).
- `backend/academic/views.py` (acciones IA de logros/indicadores).
- `backend/teachers/views.py` (análisis IA, cache y PDF IA).
- `backend/audit/services.py` (auditar acciones IA y descargas).
- `backend/kampus_backend/settings.py` (flags, límites, observabilidad).
- Scheduler en `docker-compose.yml` (migrar a jobs/cola).

Frontend:
- `kampus_frontend/src/services/api.ts` (manejo consistente de fallas IA, timeouts, retries controlados).
- `kampus_frontend/src/services/teachers.ts` (ya consume AI stats/pdf; extender a flows guiados).
- `kampus_frontend/src/pages/TeacherStatistics.tsx` (UX IA existente: enriquecer y estandarizar).
- `kampus_frontend/src/pages/Grades.tsx` (integrar “asistentes” en planilla).
- Componentes nuevos recomendados: `src/components/ai/*` (drawer, banners, feedback, job status).

---

## 12) Recomendación final

Priorizar **robustez + guardrails** antes de ampliar features:
1) Gobierno de datos/PII + rate limiting + cache + observabilidad.
2) UX guiada con fallback (sin chat libre) para asegurar adopción y control.
3) Luego: copiloto completo + detección de anomalías + búsqueda semántica.

---

### Anexo A — Ideas de interacción (UX) listas para prototipar
- Botón “Sugerir indicadores” (logro) → preview → editar → guardar.
- Botón “Mejorar redacción” (texto) → diff simple → aceptar/rechazar.
- Panel “Riesgo del grupo (agregado)” → “Generar plan de 2 semanas” → checklist.
- “Antes de imprimir PDF” → validación de cobertura → recomendaciones.

### Anexo B — Feedback loop (calidad IA)
- Capturar feedback: “útil / no útil / por qué” (sin PII) + versión de prompt.
- Dashboard interno para refinar prompts y detectar fallas.
