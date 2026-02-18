## Especificación v1: Reconciliación y trazabilidad de censo electoral

Fecha: 2026-02-17
Estado: Borrador técnico para implementación Sprint 3

### 1) Objetivo
Definir cómo sincronizar censo institucional hacia Kampus con trazabilidad de cambios (altas, bajas, modificaciones) y reglas de elegibilidad para emisión/validación de tokens de votación.

### 2) Unidad de identidad esperada
- `student_external_id` (estable y único desde sistema institucional).
- Campos de apoyo: `document_number`, `grade`, `shift`, `campus`, `status`.

### 3) Estrategia de reconciliación
Se recomienda reconciliación por **upsert + soft deactivation**:

1. **Alta**: registro viene en fuente y no existe localmente.
2. **Actualización**: existe local y cambian atributos de elegibilidad (grado/sede/jornada/estado).
3. **Baja lógica**: existe local pero no viene en snapshot actual (o llega con estado inactivo).

### 4) Snapshot por ejecución
Cada sincronización debe registrar:
- `sync_id`
- `started_at` / `finished_at`
- `source_name` (API institucional)
- `source_window` (rango o versión)
- `received_count`
- `created_count`
- `updated_count`
- `deactivated_count`
- `errors_count`
- `status` (`SUCCESS`, `PARTIAL`, `FAILED`)

### 5) Trazabilidad mínima por estudiante
Para cada cambio, almacenar evento con:
- `student_external_id`
- `change_type` (`CREATE`, `UPDATE`, `DEACTIVATE`, `REACTIVATE`)
- `before_payload` (resumen relevante)
- `after_payload` (resumen relevante)
- `sync_id`
- `timestamp`

### 6) Reglas de elegibilidad para votación
Elegible para token si:
- Estado activo en censo.
- Pertenece a sede/jornada habilitada para proceso electoral.
- Cumple criterios de grado definidos para el proceso (según política institucional).

No elegible si:
- Registro inactivo o retirado.
- Fuera de segmentación de proceso.
- Inconsistencia de identidad (sin `student_external_id` resoluble).

### 7) Política de resolución de conflictos
- Fuente institucional prevalece sobre datos locales para campos de censo.
- Excepciones manuales solo por rol autorizado y con auditoría.
- Sincronización idempotente (re-ejecutar no duplica).

### 8) Modo de ejecución recomendado
- Modo `dry-run` para previsualizar cambios sin persistir.
- Modo `apply` para aplicar cambios.
- Ejecución programada + ejecución manual bajo demanda.

### 9) Entregables de implementación siguientes
1. Modelo de snapshot de sincronización.
2. Modelo de eventos de reconciliación.
3. Servicio de integración (adapter API institucional).
4. Comando de gestión `sync_election_census` (`--dry-run`, `--apply`).
5. Validación de elegibilidad conectada al flujo de emisión/validación de token.

### 10) Riesgos y mitigaciones
- **Riesgo:** API institucional sin identificador estable.
  - **Mitigación:** acordar `student_external_id` obligatorio antes de activar sincronización.
- **Riesgo:** latencia/fallas en API externa.
  - **Mitigación:** reintentos controlados, `timeout`, estado `PARTIAL` y alertas.
- **Riesgo:** cambios masivos inesperados.
  - **Mitigación:** umbral de seguridad en `dry-run` antes de `apply`.
