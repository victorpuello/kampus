# Plan de trabajo: Comisiones de Evaluación y Promoción (2026)

## 1) Objetivo general
Implementar en Kampus un módulo de **comisiones académicas** que permita:
- Ejecutar comisiones de **evaluación por periodo**.
- Ejecutar comisiones de **promoción al cierre anual**.
- Identificar estudiantes con dificultades (regla configurable).
- Generar **actas de compromiso académico individuales**.
- Registrar de forma inmediata evento en el **observador del estudiante** al generar acta.

## 2) Decisiones de alcance validadas
- Modelo único: `Commission` con tipo (`EVALUATION`, `PROMOTION`).
- El flujo aplica explícitamente a **EVALUATION y PROMOTION**.
- Regla de dificultad configurable por **institución + año académico**.
- Criterio por defecto: **OR** (materias o áreas), umbral inicial `>= 2`.
- Filtro `group=null`: valida y procesa **todos los grupos** del alcance seleccionado.
- Bloqueos obligatorios del flujo: **planilla no creada**, **planilla incompleta**, **sin docente asignado**, **sin logros configurados**.
- Para `PROMOTION`: se exige que **todos los periodos del año estén cerrados** antes de cerrar comisión.
- Registro en observador: **al generar acta**.
- Firma MVP: **manual en PDF impreso** (director de grupo, estudiante, acudiente).
- Permisos de operación: **ADMIN** y **COORDINATOR**.

## Estado de avance (actualizado)
- Corte: **2026-02-15**.
- Backend de comisiones implementado (modelos, servicios, API DRF, permisos, auditoría).
- Frontend de workflow operativo con generación de actas, descarga PDF y cola async.
- Error 500 en `/api/commissions/` identificado y resuelto en entorno Docker aplicando migraciones pendientes del contenedor.
- Pruebas backend del flujo crítico creadas y en verde (`academic.test_commissions`).
- Título de comisión auto-generado y normalizado de forma consistente en frontend y backend (`Comisión_periodo_grado_grupo_año`).

## 3) Metas del proyecto (checklist global)

### Meta A — Dominio y configuración
- [x] Crear entidades de comisiones y decisiones por estudiante.
- [x] Crear configuración de umbral por institución y año.
- [x] Definir estados de comisión (borrador, en curso, cerrada).
- [x] Registrar trazabilidad básica de cambios relevantes.
- [x] Formalizar `group=null` como ejecución sobre todos los grupos.

### Meta B — Cálculo académico y reportes de dificultad
- [x] Implementar motor de detección de dificultad por periodo.
- [x] Implementar motor de detección de dificultad anual.
- [x] Soportar criterio OR y umbrales configurables.
- [x] Exponer salida en formato lista + resumen por comisión.
- [x] Incluir validaciones de bloqueos por estado de planilla, docente y logros.

### Meta C — Actas de compromiso
- [x] Diseñar plantilla de acta individual imprimible.
- [x] Generar PDF individual por estudiante.
- [x] Soportar generación asíncrona para volumen alto.
- [x] Guardar metadatos de acta (fecha, responsable, estado).

### Meta D — Integración observador y notificaciones
- [x] Registrar anotación automática en observador al generar acta.
- [x] Garantizar idempotencia para evitar duplicados.
- [x] Enviar notificaciones internas a los actores definidos.
- [x] Permitir consulta del evento desde historial de estudiante.

### Meta E — Frontend operativo
- [x] Crear vista de workflow de comisiones.
- [x] Incluir tabla de estudiantes con dificultad.
- [x] Incluir acción de generar acta por estudiante.
- [x] Incluir acceso rápido a observador y estado de actas.
- [x] Mostrar mensajes claros de bloqueo y precondiciones no cumplidas.

### Meta F — Calidad, seguridad y despliegue
- [x] Validar permisos por rol (negativos y positivos).
- [x] Cubrir pruebas backend del flujo crítico.
- [x] Validar UX mínima completa en frontend.
- [x] Documentar operación funcional y técnica.

## 4) Plan por sprints

## Sprint 0 — Preparación y diseño técnico (2–3 días)
**Objetivo:** dejar lista la base técnica y contractual para construir sin retrabajo.

**Entregables**
- Documento de arquitectura del módulo.
- Contrato inicial de modelos/API (borrador validado).
- Matriz de permisos por acción.

**Checklist**
- [x] Confirmar naming final de modelos y endpoints.
- [x] Definir estados de comisión y transiciones válidas.
- [x] Definir estructura de datos del reporte de dificultad.
- [x] Definir formato de acta para MVP (campos obligatorios).
- [x] Definir eventos auditables mínimos.
- [x] Acordar explícitamente precondiciones y bloqueos del flujo.

**Criterio de salida**
- Equipo alineado en alcance, contratos y reglas de negocio.

---

## Sprint 1 — Backend núcleo de comisiones (5 días)
**Objetivo:** crear persistencia y API base para operar comisiones.

**Entregables**
- Modelos y migraciones del dominio de comisiones.
- Endpoints CRUD mínimos y cierre de comisión.
- Configuración de umbral por institución/año.

**Checklist**
- [x] Crear modelos `Commission`, `CommissionRuleConfig`, `CommissionStudentDecision`, `CommitmentActa`.
- [x] Crear serializers y viewsets DRF.
- [x] Registrar rutas y permisos de ADMIN/COORDINATOR.
- [x] Incorporar auditoría en creación/cierre.
- [x] Agregar pruebas básicas de API.
- [x] Implementar semántica `group=null` para abarcar todos los grupos.

**Criterio de salida**
- Comisiones se pueden crear, consultar y cerrar con seguridad y trazabilidad.

---

## Sprint 2 — Motor de dificultad y reporte de evaluación/promoción (5 días)
**Objetivo:** identificar automáticamente estudiantes objetivo por comisión.

**Entregables**
- Servicio de cálculo por periodo (evaluación).
- Servicio de cálculo anual (promoción).
- Endpoint de preview de estudiantes en dificultad.

**Checklist**
- [x] Reusar lógica académica existente para finales y pérdidas.
- [x] Aplicar configuración OR con umbrales por institución/año.
- [x] Incluir resumen agregado (total estudiantes, total en riesgo, distribución).
- [x] Optimizar consultas críticas (evitar N+1).
- [x] Probar casos borde (sin notas, periodos incompletos, traslados).
- [x] Bloquear ejecución cuando: planilla no creada, planilla incompleta, sin docente asignado o sin logros configurados.
- [x] Exigir en `PROMOTION` que todos los periodos del año estén cerrados.

**Criterio de salida**
- Sistema entrega listado confiable de estudiantes en dificultad para ambas comisiones y con precondiciones validadas.

---

## Sprint 3 — Actas individuales + observador inmediato (5 días)
**Objetivo:** generar actas y reflejar evento académico de forma automática.

**Entregables**
- Generación de acta individual en PDF.
- Integración con sistema de reportes async para lotes.
- Anotación automática en observador al generar acta.

**Checklist**
- [x] Crear plantilla HTML de acta con campos de firma manual.
- [x] Implementar generación PDF individual y endpoint de descarga segura.
- [x] Integrar con jobs async para generación masiva.
- [x] Crear anotación en observador con `rule_key` idempotente.
- [x] Disparar notificación interna a actores configurados.

**Criterio de salida**
- Cada acta generada deja rastro en PDF + observador + notificación interna.

---

## Sprint 4 — Frontend workflow + hardening (5 días)
**Objetivo:** habilitar operación punta a punta para usuarios autorizados.

**Entregables**
- Página de workflow de comisiones.
- Acciones de preview, decisión y generación de acta.
- Validación final de flujo end-to-end.

**Checklist**
- [x] Crear servicios frontend para endpoints de comisiones.
- [x] Construir vista de lista y detalle de comisión.
- [x] Mostrar tabla de estudiantes en dificultad y estado de acta.
- [x] Integrar acción de descarga/impresión de acta.
- [x] Verificar que el observador refleje el evento inmediatamente.
- [x] Ejecutar lint y pruebas funcionales del flujo crítico.
- [x] Mostrar bloqueos de precondiciones con mensajes operativos claros.

**Criterio de salida**
- Usuario ADMIN/COORDINATOR completa el flujo sin pasos manuales externos y con bloqueos explícitos.

---

## Sprint 5 — Estabilización y salida a producción (3–4 días)
**Objetivo:** reducir riesgo operativo antes de release.

**Entregables**
- Correcciones de estabilidad y rendimiento.
- Documentación operativa para coordinación académica.
- Checklist final de despliegue.

**Checklist**
- [x] Pruebas de regresión sobre promoción existente.
- [ ] Revisión de performance en comisiones grandes.
- [x] Validación de permisos y escenarios de acceso denegado.
- [x] Actualizar documentación técnica y funcional.
- [ ] Definir plan de soporte post-lanzamiento (primeras 2 semanas).
- [x] Validar en QA que `PROMOTION` no cierre si hay periodos abiertos.

**Criterio de salida**
- Módulo listo para operar en ambiente productivo con riesgo controlado.

## 5) Dependencias y riesgos

### Dependencias
- Datos académicos completos por periodo y año.
- Catálogo institucional correcto (grupos, asignaturas, áreas, directores).
- Jobs async de reportes operativos para carga masiva.
- Estado de periodos académicos correctamente cerrado para procesos anuales de promoción.

### Riesgos
- Rendimiento al calcular dificultad masiva.
- Ambigüedad institucional en criterios pedagógicos por nivel.
- Sobrecarga operativa si no se automatiza notificación/seguimiento.
- Bloqueos por calidad de datos (planillas/docentes/logros) cerca del cierre.

### Mitigaciones
- Aplicar optimización de consultas y paginación.
- Configuración explícita por institución/año.
- Auditoría + idempotencia + colas async para robustez.
- Alertas tempranas de precondiciones incumplidas antes del cierre.

## 6) Definition of Done (DoD)
- [x] Flujo completo funciona en backend y frontend para `EVALUATION` y `PROMOTION`.
- [x] `group=null` aplica y valida todos los grupos del alcance.
- [x] Regla configurable aplicada correctamente (OR y umbrales).
- [x] Se bloquea cuando: planilla no creada, planilla incompleta, sin docente asignado o sin logros configurados.
- [x] `PROMOTION` exige todos los periodos del año cerrados.
- [x] Acta individual generada en PDF con campos de firma manual.
- [x] Evento en observador creado al generar acta, sin duplicados.
- [x] Permisos y auditoría validados.
- [x] Documentación funcional/técnica actualizada.

## 7) KPIs de éxito inicial
- Tiempo promedio para cerrar una comisión por grupo.
- % de estudiantes en dificultad con acta generada.
- % de actas con seguimiento registrado en observador.
- Incidencias de permisos o duplicados reportadas en primer mes.
- % de ejecuciones bloqueadas por precondiciones (tendencia decreciente por periodo).

## 8) Orden recomendado de ejecución inmediata
1. Sprint 0 completo.
2. Sprint 1 + Sprint 2 (backend funcional).
3. Sprint 3 (actas + observador).
4. Sprint 4 (frontend completo).
5. Sprint 5 (release).