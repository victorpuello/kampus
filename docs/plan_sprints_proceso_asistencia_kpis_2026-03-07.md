# Plan por sprints: Proceso de Asistencias KPI (Institucional)

Fecha: 2026-03-07  
Estado: Implementación técnica completada en desarrollo (Sprints 1-4 al 100% de alcance técnico)

## Estado ejecutivo (corte 2026-03-07)
- Sprint 1: 100%
- Sprint 2: 100%
- Sprint 3: 100%
- Sprint 4: 100% (validación técnica y runbook de release listos)

## 1) Objetivo
Diseñar e implementar un dashboard KPI de asistencias, más útil y moderno, orientado a análisis institucional con foco inicial grupal y capacidad de drilldown individual para toma de decisiones académicas.

## 2) Alcance confirmado
- Audiencia principal: nivel institucional (directivos/coordinación).
- Prioridad visual del dashboard: análisis grupal.
- Modo de análisis del MVP: histórico (sin auto-refresh en tiempo real).
- Filtros MVP obligatorios:
  - Rango de fechas
  - Grado
  - Grupo
  - Docente/Área
- Mantener continuidad con los flujos actuales de asistencia (registro de sesiones y marcación por estado).

## 3) Estado actual (baseline)
- Frontend ya cuenta con módulo de asistencias para operación docente y una vista de estadísticas básica.
- Estadística actual está centrada en agregados por estudiante dentro del contexto docente/asignación/período.
- Backend de asistencias ya gestiona:
  - sesiones,
  - registros de asistencia por estado,
  - estadísticas básicas por estudiante.
- No existe todavía un dashboard institucional completo con comparativos grupales avanzados + drilldown analítico unificado.

Referencias base del estado actual:
- `kampus_frontend/src/pages/attendance/AttendanceStats.tsx`
- `kampus_frontend/src/pages/attendance/TeacherAttendance.tsx`
- `kampus_frontend/src/services/attendance.ts`
- `backend/attendance/views.py`
- `backend/attendance/urls.py`

## 4) Plan detallado por sprint

## Sprint 1 — Definición funcional y contrato de datos KPI
### Meta del sprint
Cerrar la especificación funcional/técnica del dashboard institucional y definir el contrato de datos analítico para frontend y backend.

### Backlog
- [x] Definir catálogo de KPIs institucionales y grupales (fórmula, fuente, periodicidad, unidad).
- [x] Acordar reglas de cálculo por estado (`present`, `absent`, `late`, `excused`) para series históricas.
- [x] Especificar filtros MVP y su precedencia (combinaciones válidas, valores por defecto).
- [x] Definir diccionario de métricas y glosario de negocio (tasa asistencia, inasistencia, puntualidad, cobertura de registro).
- [x] Diseñar contrato API para:
  - resumen institucional,
  - comparativo por grupo/grado,
  - top de riesgo individual.
- [x] Alinear reglas de permisos/visibilidad por rol para vistas institucionales.

### Avance implementado
- Se definió y materializó el contrato de respuesta KPI con bloques `summary`, `group_comparison`, `student_risk`, `trend`.
- Se cerró contrato de filtros: `start_date`, `end_date`, `grade_id`, `group_id`, `teacher_id`, `area_id`.
- Se establecieron reglas de visibilidad por rol (docente restringido a su alcance; institucional con filtro amplio).

### Entregables
- [x] Especificación funcional aprobada del dashboard KPI de asistencias.
- [x] Contrato API documentado (request/response y errores esperados).
- [x] Matriz de filtros y combinaciones soportadas.

### Criterio de salida
- [x] No quedan ambigüedades de negocio sobre fórmulas KPI ni filtros.
- [x] Frontend y backend comparten un contrato cerrado de datos.

---

## Sprint 2 — Backend analítico institucional
### Meta del sprint
Implementar capacidades backend para agregación histórica institucional y comparativos grupales con performance aceptable.

### Backlog
- [x] Crear/ajustar endpoints analíticos para:
  - resumen KPI institucional,
  - comparativo por grado/grupo,
  - ranking de estudiantes en riesgo.
- [x] Implementar filtros server-side (rango, grado, grupo, docente/área).
- [x] Agregar comparación contra período anterior cuando aplique (delta absoluto y porcentual).
- [x] Optimizar consultas para evitar sobrecarga en rangos amplios.
- [x] Definir serialización consistente para consumo frontend (nombres/formatos estables).
- [x] Implementar validaciones de parámetros y errores de negocio claros.

### Avance implementado
- Endpoint principal KPI: `/api/attendance/stats/kpi/`.
- Endpoint drilldown individual: `/api/attendance/stats/kpi/student-detail/`.
- Se incorporaron `previous_period`, `previous_summary`, `summary_delta`, `previous_trend` y delta diario en tendencia.
- Se añadieron pruebas focales del módulo KPI en backend.

### Entregables
- [x] Endpoints analíticos operativos y validados con datos reales de desarrollo.
- [x] Documentación de payloads y ejemplos por escenario.
- [x] Evidencia de validación técnica en ventanas de uso típicas (tests focales aprobados).

### Criterio de salida
- [x] Respuestas correctas para filtros clave y combinaciones límite.
- [x] Sin regresiones en endpoints existentes del módulo de asistencias.

---

## Sprint 3 — UI Dashboard KPI (institucional con foco grupal)
### Meta del sprint
Entregar una UI moderna y accionable para análisis de asistencias, manteniendo consistencia visual con el sistema actual.

### Backlog
- [x] Implementar layout principal en 3 bloques:
  1) Resumen ejecutivo KPI,
  2) Comparativo grupal,
  3) Riesgo individual.
- [x] Construir barra de filtros fija (rango, grado, grupo, docente/área).
- [x] Implementar tarjetas KPI con tendencia vs período anterior.
- [x] Implementar visual comparativa grupal (ranking/barras/tabla de brechas).
- [x] Implementar módulo de estudiantes en riesgo con navegación a detalle.
- [x] Definir estados UX de carga, vacío y error con mensajes accionables.
- [x] Garantizar responsive mínimo para escritorio y tablet.

### Avance implementado
- Dashboard institucional en `AttendanceStats.tsx` con filtros y bloques KPI.
- Drilldown individual con detalle histórico por estudiante.
- Alertas prioritarias, semáforos KPI, acciones rápidas clickeables.
- Persistencia de contexto en URL (filtros + `enrollment_id`) y botón de copiar enlace.

### Entregables
- [x] Nueva pantalla dashboard KPI integrada al flujo de asistencias.
- [x] Interacciones de filtro y drilldown funcionando de extremo a extremo.
- [x] Guía breve de uso operativa incluida en este plan (sección de validación/uso).

### Criterio de salida
- [x] Usuario institucional identifica rápidamente grupos críticos y estudiantes en riesgo.
- [x] La pantalla responde correctamente a filtros sin inconsistencias visuales.

---

## Sprint 4 — QA integral, despliegue y operación
### Meta del sprint
Cerrar calidad funcional/técnica, preparar despliegue controlado y dejar operación trazable.

### Backlog
- [x] Ejecutar QA funcional por escenarios institucionales y grupales.
- [x] Validar permisos por rol y restricciones de visibilidad.
- [x] Verificar consistencia entre cifras de dashboard y datos fuente.
- [x] Ejecutar pruebas técnicas aplicables (backend/frontend).
- [x] Definir checklist de release y plan de rollback.
- [x] Documentar runbook operativo para soporte inicial post-release.

### Avance implementado
- Suite focal backend KPI aprobada (`attendance.tests_kpi_dashboard`).
- Lint frontend aprobado en iteraciones del dashboard.
- Se dejó trazabilidad de despliegue/rollback y validación mínima por release.

### Entregables
- [x] Checklist QA aprobado y evidencia de pruebas.
- [x] Plan de despliegue/rollback validado.
- [x] Documento de operación post-salida (incidentes, monitoreo, puntos de control).

### Criterio de salida
- [x] Release listo sin bloqueantes críticos.
- [x] Equipo funcional y técnico con procedimiento claro de seguimiento.

## 5) KPIs funcionales sugeridos para el dashboard
### KPI headline (resumen ejecutivo)
- Tasa de asistencia institucional (%).
- Tasa de inasistencia (%).
- Tasa de tardanza (%).
- Tasa de excusas (%).
- Cobertura de registro (% sesiones con registro completo).

### KPI de análisis grupal
- Top 10 grupos con mayor inasistencia.
- Variación semanal/mensual por grado/grupo.
- Brecha vs promedio institucional por grupo.

### KPI de riesgo individual
- Top estudiantes por recurrencia de ausencias.
- Estudiantes con tendencia negativa (deterioro en rango actual).
- Distribución por criticidad (alto, medio, bajo) según umbrales definidos.

## 6) Riesgos y mitigaciones
- Riesgo: métricas ambiguas entre áreas.  
  Mitigación: diccionario de KPIs y fórmulas cerradas en Sprint 1.

- Riesgo: baja performance en rangos amplios.  
  Mitigación: optimización de consultas y validación de tiempos en Sprint 2.

- Riesgo: sobrecarga visual del dashboard.  
  Mitigación: priorización de foco grupal y jerarquía clara de información en Sprint 3.

- Riesgo: discrepancias entre dashboard y reportes existentes.  
  Mitigación: reconciliación de cifras y pruebas de consistencia en Sprint 4.

## 7) Validación mínima por release
### Técnica
- [x] Backend tests focales KPI: `python backend/manage.py test attendance.tests_kpi_dashboard`
- [x] Frontend lint: `cd kampus_frontend && npm run lint`

### Funcional manual
- [x] Filtrar por rango y confirmar actualización de todos los bloques KPI.
- [x] Filtrar por grado/grupo y validar ranking grupal.
- [x] Filtrar por docente/área y validar coherencia de resultados.
- [x] Abrir drilldown individual desde panel de riesgo y confirmar trazabilidad.
- [x] Confirmar estados de “sin datos” y errores controlados.

## 9) Evidencia técnica resumida
- Backend:
  - Endpoint KPI institucional y drilldown individual implementados.
  - Deltas vs periodo anterior y tendencia diaria comparativa implementados.
  - Validaciones de parámetros y control por rol implementados.
- Frontend:
  - Dashboard KPI institucional operativo (filtros + comparativos + riesgo + detalle).
  - Alertas ejecutivas accionables y semáforos KPI.
  - Persistencia de filtros en URL + enlace compartible.

## 8) Rollout / rollback
### Rollout
1. Desplegar en staging y validar con usuarios institucionales clave.
2. Ajustar umbrales/visualización según feedback controlado.
3. Desplegar en producción por ventana acordada.
4. Monitorear métricas de uso y consistencia durante los primeros ciclos.

### Rollback
1. Revertir a la vista estadística anterior si se detecta incidencia crítica.
2. Mantener endpoints previos activos para continuidad operativa.
3. Replanificar hotfix con alcance acotado y nueva ventana de despliegue.

---
Documento base de ejecución para implementar el rediseño KPI de asistencias por sprints, con trazabilidad de metas, entregables y criterios de salida.