# Runbook de Remediación de Logros/Banco para Deploy

## Objetivo
Aplicar remediación histórica de vínculos `logro ↔ definición` en Postgres de forma controlada, auditable y reversible.

## Comando involucrado
- Comando Django: `remediate_achievement_bank_links`
- Ubicación: `backend/academic/management/commands/remediate_achievement_bank_links.py`
- Modo por defecto: `dry-run` (no escribe)
- Modo escritura: `--apply`

## Pre-deploy checklist (obligatorio)
- [ ] Confirmar ventana de mantenimiento o baja concurrencia.
- [ ] Confirmar respaldo reciente de Postgres.
- [ ] Confirmar que backend desplegado contiene el comando de remediación.
- [ ] Confirmar acceso operativo a `docker compose`.

## 1) Respaldo de seguridad (antes de aplicar)
```bash
docker compose exec db sh -lc 'pg_dump -U kampus -d kampus -Fc -f /tmp/kampus_pre_remediation.dump'
docker compose cp db:/tmp/kampus_pre_remediation.dump ./kampus_pre_remediation.dump
```

Validar que el archivo existe y tiene tamaño > 0.

## 2) Dry-run en entorno objetivo
```bash
docker compose exec backend python manage.py remediate_achievement_bank_links
```

Esperado:
- Resumen con `needs_remediation`, `planned_create`, `planned_relink`.
- Sin errores/excepciones.

## 3) Aplicar remediación
```bash
docker compose exec backend python manage.py remediate_achievement_bank_links --apply
```

Opcional (owner explícito para nuevas definiciones):
```bash
docker compose exec backend python manage.py remediate_achievement_bank_links --apply --owner-username <usuario>
```

## 4) Validación post-apply (integridad)
```bash
docker compose exec backend python manage.py shell -c "import json; from django.db import connection; from django.db.models import Count; from academic.models import Achievement, AchievementDefinition, PerformanceIndicator; report={}; report['db_vendor']=connection.vendor; report['totals']={'achievements':Achievement.objects.count(),'definitions':AchievementDefinition.objects.count(),'indicators':PerformanceIndicator.objects.count()}; report['orphan_indicators']=PerformanceIndicator.objects.filter(achievement__isnull=True).count(); report['duplicate_indicator_level_pairs_count']=PerformanceIndicator.objects.values('achievement_id','level').annotate(c=Count('id')).filter(c__gt=1).count(); report['achievements_without_indicators']=Achievement.objects.annotate(ic=Count('indicators')).filter(ic=0).count(); mismatch_subject=0; mismatch_grade=0; mismatch_dimension=0; with_definition=0;\
for a in Achievement.objects.select_related('group','definition').all():\
    d=a.definition\
    if not d:\
        continue\
    with_definition+=1\
    if d.subject_id and a.subject_id and d.subject_id!=a.subject_id:\
        mismatch_subject+=1\
    if d.grade_id and a.group_id and a.group and d.grade_id!=a.group.grade_id:\
        mismatch_grade+=1\
    if d.dimension_id and a.dimension_id and d.dimension_id!=a.dimension_id:\
        mismatch_dimension+=1\
report['definition_link_mismatch']={'with_definition':with_definition,'subject_mismatch':mismatch_subject,'grade_mismatch':mismatch_grade,'dimension_mismatch':mismatch_dimension};\
norm=lambda s:' '.join((s or '').split()).strip().lower(); bank_keys=set((d.subject_id,d.grade_id,d.dimension_id,norm(d.description)) for d in AchievementDefinition.objects.all()); candidates=0; without_match=0;\
for a in Achievement.objects.select_related('group').filter(definition__isnull=True):\
    if not a.subject_id or not a.group_id:\
        continue\
    candidates+=1\
    key=(a.subject_id,(a.group.grade_id if a.group else None),a.dimension_id,norm(a.description))\
    if key not in bank_keys:\
        without_match+=1\
report['possible_historical_unsynced_manual_achievements']={'candidates_without_definition':candidates,'without_matching_bank_entry':without_match}; print(json.dumps(report, ensure_ascii=False))"
```

Esperado mínimo:
- `orphan_indicators = 0`
- `duplicate_indicator_level_pairs_count = 0`
- `definition_link_mismatch.subject_mismatch = 0`
- `definition_link_mismatch.grade_mismatch = 0`
- `definition_link_mismatch.dimension_mismatch = 0`
- `possible_historical_unsynced_manual_achievements.without_matching_bank_entry = 0`

## 5) Smoke test funcional
- [ ] Crear logro manual en Planeación y verificar aparición en Banco.
- [ ] Importar logro, editarlo y verificar actualización en Banco.
- [ ] Verificar IA en descripción y regeneración de indicadores.

## Rollback (si algo sale mal)
1. Detener escrituras de backend (ventana corta de mantenimiento).
2. Restaurar backup:

```bash
cat ./kampus_pre_remediation.dump | docker compose exec -T db sh -lc 'pg_restore -U kampus -d kampus --clean --if-exists --no-owner --no-privileges'
```

3. Levantar/estabilizar servicios y revalidar salud del backend.
4. Re-ejecutar auditoría de integridad.

## Registro de auditoría del deploy
- Fecha/hora del dry-run.
- Resultado numérico del dry-run.
- Fecha/hora del apply.
- Resultado numérico post-apply.
- Evidencia de smoke test.
- Responsable de ejecución.
