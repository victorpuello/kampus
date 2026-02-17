# Release Notes — 2026-02-16

## Alcance
Esta versión corrige el flujo de Planeación de periodo para sincronizar logros escritos manualmente con el Banco de Logros y añade herramientas de remediación controlada para datos históricos.

## Cambios funcionales
- Planeación de periodo: al guardar un logro escrito manualmente, ahora se sincroniza automáticamente con Banco de Logros.
- Deduplicación aplicada en sincronización de banco para evitar crear definiciones repetidas por contexto académico.
- Si un logro importado desde banco se edita en Planeación, se actualiza su definición correspondiente.
- Se añadió botón **Mejorar con IA** en Descripción del Logro, alineado con la UX del Banco de Logros.

## Estabilidad y datos
- Se incorporó comando de remediación controlada para alinear `achievement.definition` y crear definiciones faltantes sin duplicar:
  - `python manage.py remediate_achievement_bank_links` (dry-run)
  - `python manage.py remediate_achievement_bank_links --apply` (aplicar)
- Se documentó runbook completo de despliegue, validación y rollback.

## Evidencia técnica ejecutada
- Frontend lint: OK
- Frontend build: OK
- Backend tests (`academic`): 67 OK
- Auditoría de integridad en Postgres (Docker) post-remediación:
  - `orphan_indicators = 0`
  - `duplicate_indicator_level_pairs_count = 0`
  - `subject_mismatch = 0`
  - `grade_mismatch = 0`
  - `dimension_mismatch = 0`
  - `without_matching_bank_entry = 0`

## Documentación asociada
- `docs/plan_sprints_planeacion_logros_2026-02-16.md`
- `docs/runbook_remediacion_logros_banco_deploy.md`
