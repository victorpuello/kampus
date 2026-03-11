# Planeador de Clases con IA

## Objetivo

Construir una funcionalidad de planeación de clases mediada por IA dentro del monolito actual de Kampus, reutilizando el dominio académico, los permisos docentes, las ventanas de edición por período y el pipeline de reportes ya existente. El MVP se orienta a bachillerato, con temáticas precargadas por período, asistencia IA por secciones, persistencia completa en plataforma y exportación PDF alineada al formato institucional PC-BACH.

## Decisión de Arquitectura

La recomendación inicial es mantener esta implementación dentro del monolito y no extraerla como microservicio. Las razones son:

- La funcionalidad depende directamente de `Period`, `TeacherAssignment`, `AcademicLoad`, `Group`, `Subject`, permisos por rol y ventanas de edición ya implementadas.
- La trazabilidad docente, la coherencia curricular y la futura exportación documental requieren acceso transaccional al mismo dominio.
- La infraestructura actual ya resuelve autenticación, permisos, almacenamiento y reportes PDF.

Si en el futuro la generación asistida por IA crece en latencia o volumen, el siguiente paso recomendado es mover las tareas pesadas a Celery dentro del mismo monolito antes de evaluar una separación por servicios.

## Alcance del MVP

### Incluido

- Bachillerato en la primera fase.
- Carga previa de temáticas por período.
- Carga manual e importación masiva de temáticas.
- Planeación editable en plataforma.
- IA como asistente por secciones.
- Validaciones pedagógicas y operativas en backend.
- Exportación PDF institucional.
- Auditoría básica y piloto controlado.

### Excluido en esta fase

- Microservicio independiente para IA o planeación.
- Soporte completo para primaria y preescolar.
- Exportación Word/DOCX.
- Generación masiva de planes en lote.
- Versionado avanzado con historial completo de diferencias.
- Múltiples formatos institucionales parametrizables.

## Flujo Objetivo

1. Coordinación académica carga las temáticas oficiales por período, grado y asignatura.
2. El docente selecciona su contexto académico dentro de sus asignaciones.
3. El docente crea un plan de clase a partir de una temática precargada o lo diligencia manualmente.
4. La IA asiste por secciones: resultado de aprendizaje, competencias, secuencia didáctica, evidencia, evaluación, recursos y DUA.
5. El backend valida integridad, coherencia temporal y criterios institucionales.
6. El docente guarda, finaliza y exporta el plan en PDF.

## Modelo Inicial Implementado

### `PeriodTopic`

Representa una temática oficial cargada para un período y una carga académica específica.

Campos clave:

- `period`
- `academic_load`
- `title`
- `description`
- `sequence_order`
- `source`
- `is_active`
- `created_by`
- `created_at`
- `updated_at`

### `ClassPlan`

Representa el plan de clase estructurado asociado a una asignación docente y a un período.

Campos clave:

- `teacher_assignment`
- `period`
- `topic`
- `title`
- `class_date`
- `duration_minutes`
- `learning_result`
- `dba_reference`
- `standard_reference`
- `competency_know`
- `competency_do`
- `competency_be`
- `class_purpose`
- `start_time_minutes`
- `start_activities`
- `development_time_minutes`
- `development_activities`
- `closing_time_minutes`
- `closing_activities`
- `evidence_product`
- `evaluation_instrument`
- `evaluation_criterion`
- `resources`
- `dua_adjustments`
- `status`
- `ai_assisted_sections`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

## Reglas Base Implementadas

- Un docente solo puede gestionar planes de clase de sus propias asignaciones.
- Un docente solo puede gestionar temáticas asociadas a cargas académicas que tenga asignadas.
- La temática debe pertenecer al mismo período del plan.
- La temática debe pertenecer a la misma carga académica de la asignación docente.
- La duración total del plan debe coincidir con la suma de inicio, desarrollo y cierre.
- Un plan no puede pasar a `FINALIZED` si faltan campos mínimos críticos.
- Se conserva el control de ventana de edición docente basado en `planning_edit_until` y `EditGrant`.

## Plan por Sprints

### Sprint 0. Definición, alineación y diseño base

**Objetivo**
Cerrar arquitectura, alcance, actores, estados y backlog base.

**Entregables**
- Decisión formal de mantener el monolito.
- Definición del MVP.
- Diseño lógico preliminar.
- Backlog inicial priorizado.

### Sprint 1. Modelo de datos y persistencia base

**Objetivo**
Crear la base de datos y estructuras backend del nuevo módulo.

**Entregables**
- Modelos `PeriodTopic` y `ClassPlan`.
- Migraciones iniciales.
- Serializers base.

### Sprint 2. Carga curricular previa de temáticas

**Objetivo**
Permitir carga manual e importación masiva de temáticas por período.

**Entregables**
- API de temáticas.
- Validaciones de integridad.
- Reporte de errores por fila para importación.

### Sprint 3. API funcional del planeador de clases

**Objetivo**
Exponer CRUD y filtros para planes de clase, con seguridad docente y restricciones por período.

**Entregables**
- API de planes de clase.
- Filtros por período, asignación, estado, grupo y asignatura.
- Scoping docente.

### Sprint 4. IA asistida por secciones

**Objetivo**
Extender el AIService para sugerencias estructuradas por bloque.

**Entregables**
- Operaciones IA por sección.
- Contratos JSON.
- Validación de respuestas.

### Sprint 5. Frontend del docente

**Objetivo**
Construir la experiencia de creación, edición y guardado del plan de clase.

**Entregables**
- Nueva pantalla o tab del planeador.
- Lista de temáticas disponibles.
- Formulario por secciones.
- Guardado parcial y finalización.

### Sprint 6. Frontend de coordinación para temáticas

**Objetivo**
Permitir a coordinación operar el catálogo curricular por período.

**Entregables**
- Tabla compacta de temáticas.
- Alta y edición manual.
- Importación masiva con plantilla y previsualización.

### Sprint 7. Validaciones, coherencia y estados

**Objetivo**
Blindar la calidad funcional y pedagógica del plan.

**Entregables**
- Validaciones de tiempos y obligatoriedad.
- Reglas para finalización.
- Validación de criterio SIEE.

### Sprint 8. Exportación PDF del formato institucional

**Objetivo**
Generar el documento final en PDF con estructura institucional.

**Entregables**
- Plantilla HTML orientada a WeasyPrint.
- Integración con jobs de reportes.
- Descarga del PDF final.

### Sprint 9. Auditoría, métricas, piloto y despliegue

**Objetivo**
Medir uso, validar adopción y ajustar antes del rollout completo.

**Entregables**
- Auditoría mínima.
- Métricas de cobertura y exportación.
- Piloto con docentes.
- Ajustes finales de UX y prompts.

## Orden Recomendado de Ejecución

1. Sprint 0 y Sprint 1 para cerrar el contrato de dominio.
2. Sprint 2 y Sprint 3 para habilitar datos y API base.
3. Sprint 4 en paralelo parcial con Sprint 5 cuando el contrato ya esté estable.
4. Sprint 6 en paralelo con Sprint 5 una vez la API esté lista.
5. Sprint 7 antes de cerrar exportación.
6. Sprint 8 para salida documental.
7. Sprint 9 para validación real y despliegue.

## Estado Revisado al 2026-03-10

### Resumen Ejecutivo

El plan ya no está en un "primer corte". El módulo tiene backend funcional, UI docente operativa, UI de coordinación para temáticas, asistencia IA por borrador y por secciones, y exportación PDF institucional disponible desde la ruta dedicada del planeador de clases.

### Estado por Sprint

#### Sprint 0. Definición, alineación y diseño base

**Estado:** Implementado

**Objetivo de cierre:** 100%

Ya está resuelto en la documentación y en la ejecución del proyecto:

- Se confirmó la decisión de mantener el monolito.
- El alcance MVP quedó delimitado a bachillerato.
- El backlog base y el orden de ejecución quedaron documentados.

#### Sprint 1. Modelo de datos y persistencia base

**Estado:** Implementado

**Objetivo de cierre:** 100%

Implementado en código:

- Modelo `PeriodTopic`.
- Modelo `ClassPlan`.
- Migración inicial `0020_periodtopic_classplan`.
- Serializers con reglas base de dominio.

#### Sprint 2. Carga curricular previa de temáticas

**Estado:** Implementado

**Objetivo de cierre:** 100%

Implementado en backend y frontend:

- CRUD de temáticas por período.
- Validaciones de integridad y duplicados.
- Descarga de plantilla Excel.
- Importación masiva por archivo, con soporte principal para Excel y compatibilidad CSV.
- Reporte de filas creadas, actualizadas y errores.

#### Sprint 3. API funcional del planeador de clases

**Estado:** Implementado

**Objetivo de cierre:** 100%

Implementado en backend:

- CRUD de `ClassPlan`.
- Scoping docente por `TeacherAssignment`.
- Filtros por período, asignación, estado, grupo, asignatura y año.
- Restricción por ventana de edición usando `planning_edit_until` y `EditGrant`.
- Validaciones para impedir que un docente opere asignaciones ajenas.

#### Sprint 4. IA asistida por secciones

**Estado:** Implementado

**Objetivo de cierre:** 100%

Implementado en backend y frontend:

- Generación de borrador completo con IA.
- Generación por secciones.
- Contratos JSON controlados desde `AIService`.
- Manejo de errores de configuración, proveedor y parseo.

#### Sprint 5. Frontend del docente

**Estado:** Implementado

**Objetivo de cierre:** 100%

Implementado en frontend:

- Ruta dedicada `/class-planner`.
- Pantalla propia del planeador de clases.
- Lista de temáticas y planes.
- Formulario por secciones.

#### Sprint 6. Frontend docente para temáticas

**Estado:** Implementado

**Objetivo de cierre:** 100%

Ya implementado:

- Vista compacta de temáticas dentro del submenú del planeador de clases.
- Alta y edición manual por docente sobre sus propias asignaciones.
- Importación masiva con plantilla y previsualización previa.
- Resumen posterior de resultados y errores.
- Flujo orientado a Excel (`.xlsx` y `.xls`) con compatibilidad CSV.

#### Sprint 7. Validaciones, coherencia y estados

**Estado:** Implementado

**Objetivo de cierre:** 100%

Ya implementado:

- Coherencia entre duración total y suma de inicio, desarrollo y cierre.
- Validaciones de obligatoriedad para `FINALIZED`.
- Coherencia entre tema, período y asignación docente.
- Restricciones por ventana de edición.
- Validación funcional mínima del criterio SIEE e instrumento para evitar placeholders o contenido débil.
- Cobertura automatizada específica del módulo para serializers, importación y exportación.

#### Sprint 8. Exportación PDF del formato institucional

**Estado:** Implementado

**Objetivo de cierre:** 100%

Ya implementado:

- Plantilla HTML institucional `class_plan_pdf.html`.
- Flujo asíncrono de exportación desde el planeador usando `ReportJob`.
- Descarga automática del PDF cuando el job termina.
- Endpoint del planeador alineado al flujo asíncrono, sin generar el binario en la respuesta.
- Soporte de `CLASS_PLAN` en `ReportJob` y en `reports/tasks.py`.

#### Sprint 9. Auditoría, métricas, piloto y despliegue

**Estado:** Parcial alto

**Objetivo de cierre:** 100%

Ya implementado:

- Auditoría operativa básica del módulo para creación, edición, finalización, IA y exportación.
- Métricas compactas en la UI del docente para cobertura, planes finalizados, uso de IA y exportaciones.
- Panel de actividad reciente del planeador para trazabilidad inmediata.
- Trazabilidad básica en datos mediante `created_by`, `updated_by`, `created_at` y `updated_at`.
- Registro de secciones asistidas por IA en `ai_assisted_sections`.

Falta:

- Piloto formal con docentes.
- Ajuste iterativo de prompts y UX basado en uso real.

## Lo Que Ya Está Implementado

- Dominio persistente para temáticas por período y planes de clase.
- API de temáticas con CRUD, plantilla Excel e importación masiva por archivo.
- API de planes con CRUD, filtros y scoping docente.
- IA para borrador completo y para secciones.
- Validaciones de integridad temporal y de finalización.
- Ruta principal `/class-planner` con UI dedicada del docente.
- Pantalla de temáticas para docentes en `/class-planner/topics`.
- Exportación PDF del formato institucional.
- Integración base del tipo `CLASS_PLAN` dentro del sistema de reportes.

## Lo Que Falta

1. Añadir previsualización previa del PDF si se quiere revisión visual antes de descargar.
2. Ampliar pruebas automatizadas a más escenarios del módulo, especialmente acciones IA por secciones y estados de error del flujo asíncrono.
3. Ejecutar piloto formal con docentes.
4. Cerrar ajuste iterativo de prompts y UX basado en uso real.

## Condiciones Para Llevar Todos Los Sprints Al 100%

Para poder marcar honestamente todos los sprints al 100%, todavía se debe completar lo siguiente:

1. Sprint 8: agregar previsualización previa del PDF si se decide incluir revisión antes de descarga.
2. Sprint 9: ejecutar piloto con docentes y cerrar ajustes finales de UX y prompts basados en operación real.

## Verificación Actual Esperada

1. Un docente autenticado puede entrar a `/class-planner` y crear, editar, finalizar y exportar sus planes.
2. Un docente solo ve y gestiona planes y temáticas de sus propias asignaciones.
3. Un docente puede administrar sus temáticas manualmente o por archivo, preferiblemente Excel.
4. La IA puede sugerir borradores completos o solo bloques específicos del plan.
5. Un plan finalizado exige campos mínimos y coherencia temporal antes de exportarse.
6. `/planning` queda reservado al módulo de planeación de período y `/class-planner` al planeador de clases.