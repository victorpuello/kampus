# Plan de trabajo por sprints
## Bug: Banco de Logros + mejora IA en Planeación

## Objetivo general
Corregir el flujo del modal de Planeación de periodo para que:
- los logros escritos manualmente también se guarden en el Banco de Logros del docente,
- el campo Descripción del Logro tenga mejora con IA igual al Banco de Logros,
- y el guardado se mantenga resiliente (sin bloquear la planeación por fallos del sync de banco).

## Alcance funcional acordado
- Guardado automático en banco al guardar la planeación.
- Duplicados: no crear; reutilizar si ya existe uno equivalente en el mismo contexto.
- Si se importa del banco y se edita la descripción: actualizar el logro original.
- Si falla el guardado en banco: reintento silencioso y no bloquear guardado de planeación.

---

## Sprint 1 — Descubrimiento técnico y contrato de flujo
### Meta del sprint
Cerrar el diseño técnico y reglas de negocio del flujo completo.

### Tareas
- Mapear frontend y backend involucrados:
	- `PeriodPlanning.tsx`
	- `AchievementBank.tsx`
	- `academic.ts`
	- `views.py`
	- `serializers.py`
- Definir casos funcionales obligatorios:
	- Manual nuevo
	- Manual duplicado
	- Importado sin edición
	- Importado y editado
	- Falla de guardado en banco con planeación exitosa
- Acordar secuencia final de llamadas y fallback de errores.

### Entregables
- Matriz de casos y decisiones cerradas.
- Secuencia de llamadas del submit de Planeación aprobada.

### Criterio de salida
- No hay ambigüedades funcionales pendientes.

---

## Sprint 2 — UX IA en Descripción del Logro
### Meta del sprint
Unificar la experiencia de IA en el modal de Planeación con el patrón de Banco de Logros.

### Tareas
- Agregar acción “Mejorar con IA” en Descripción del Logro.
- Mantener loading independiente para:
	- Mejorar redacción IA (descripción)
	- Regenerar indicadores IA
- Mantener consistencia visual y de interacción del modal.

### Entregables
- Flujo UX de mejora IA activo en Planeación.
- Manejo de error no intrusivo en mejora IA.

### Criterio de salida
- El usuario puede mejorar descripción y regenerar indicadores sin conflictos de estado.

---

## Sprint 3 — Persistencia automática en Banco de Logros
### Meta del sprint
Persistir en banco desde Planeación con deduplicación y sincronización segura.

### Tareas
- Extender submit de Planeación para sync de banco:
	- Manual: crear si no existe duplicado.
	- Importado + editado: actualizar original.
	- Importado sin cambios: no modificar banco.
- Implementar deduplicación por contexto:
	- asignatura,
	- grado,
	- dimensión,
	- descripción normalizada.
- Aplicar reintento silencioso de sync al banco.

### Entregables
- Flujo de guardado completo y resiliente.
- Registro técnico de fallos de sync sin bloqueo de UX.

### Criterio de salida
- Planeación se guarda siempre que su endpoint principal responda OK.

---

## Sprint 4 — Validación integral y hardening
### Meta del sprint
Validar escenarios completos y prevenir regresiones.

### Tareas
- Ejecutar validaciones funcionales de todos los escenarios.
- Verificar permisos y reglas docentes/coordinación.
- Confirmar no regresiones en Planeación y Banco.

### Entregables
- Checklist QA funcional aprobado.
- Evidencia de validación técnica (lint/build/tests aplicables).

### Criterio de salida
- Flujo estable en escenarios nominales y de error.

---

## Checklist de verificación final
### Técnica
- [x] Frontend lint: `npm run lint`
- [x] Frontend build: `npm run build`
- [x] Backend tests focales: `python backend/manage.py test academic`

### Funcional manual
- [ ] Crear logro manual y confirmar alta en banco.
- [ ] Repetir logro equivalente y confirmar no duplicado.
- [ ] Importar + editar y confirmar actualización del banco.
- [ ] Simular fallo de sync de banco y confirmar que planeación se guarda.
- [ ] Probar mejora IA en descripción y regeneración IA de indicadores en paralelo.

## Runbook QA manual (Sprint 4)
### Precondiciones
- Backend y frontend levantados en entorno local.
- Usuario docente con asignaciones activas para grado/grupo/asignatura.
- Año, periodo, grupo y asignatura con permisos de edición vigentes.

### Preparación de sesión
1. Ingresar como docente.
2. Ir a módulo **Planeación** > pestaña **Planeación de periodo**.
3. Seleccionar Año, Periodo, Grado, Grupo y Asignatura válidos.
4. Abrir modal **Agregar Logro**.

### Caso 1 — Manual nuevo se guarda en banco
1. Elegir Dimensión.
2. No seleccionar logro del banco.
3. Escribir descripción única en **Descripción del Logro**.
4. Guardar planeación.
5. Ir a **Banco de Logros** y filtrar por mismo grado/asignatura/dimensión.

**Resultado esperado:**
- El logro aparece en planeación.
- El logro nuevo aparece en banco con misma descripción y contexto académico.

### Caso 2 — Manual duplicado no crea nuevo registro
1. Repetir flujo del Caso 1 usando texto equivalente (mismo contenido, variando espacios o mayúsculas).
2. Guardar planeación.
3. Revisar Banco de Logros.

**Resultado esperado:**
- Se guarda la planeación.
- No se crea un segundo logro duplicado en banco.

### Caso 3 — Importado + editado actualiza original
1. Crear/ubicar un logro en banco para esa dimensión.
2. En Planeación, importar ese logro desde el selector.
3. Modificar texto en **Descripción del Logro**.
4. Guardar planeación.
5. Volver a Banco y abrir ese logro original.

**Resultado esperado:**
- Planeación guarda la descripción editada.
- El logro original del banco queda actualizado con la nueva redacción.

### Caso 4 — Falla de sync de banco no bloquea planeación
1. Provocar fallo temporal de endpoint de banco (simulado en backend/proxy o desconexión selectiva).
2. Guardar una planeación manual.

**Resultado esperado:**
- Planeación se guarda correctamente.
- Sync de banco falla sin bloquear UX (con reintento silencioso).

### Caso 5 — IA descripción + IA indicadores en paralelo
1. En modal, escribir descripción base.
2. Usar **Mejorar con IA** y validar cambio de texto.
3. Usar **Regenerar con IA** para indicadores.
4. Verificar que ambos estados de carga funcionan de forma independiente.

**Resultado esperado:**
- Mejora de descripción funciona.
- Regeneración de indicadores funciona.
- No hay bloqueo cruzado entre ambas acciones.

### Evidencia a registrar
- Captura del logro en Planeación (antes/después de guardar).
- Captura del logro en Banco para cada caso relevante.
- Nota breve de resultado por caso (`OK` / `FAIL`) con observaciones.

---

## Runbook de despliegue (próximo release)

### Objetivo
Aplicar la remediación histórica de vínculos `logro ↔ definición` en Postgres de forma controlada, auditable y reversible.

### Script de remediación
- Comando Django: `remediate_achievement_bank_links`
- Ubicación: `backend/academic/management/commands/remediate_achievement_bank_links.py`
- Modo por defecto: `dry-run` (no escribe)
- Modo escritura: `--apply`

### Pre-deploy checklist (obligatorio)
- [ ] Confirmar ventana de mantenimiento o baja concurrencia.
- [ ] Confirmar respaldo reciente de Postgres.
- [ ] Confirmar que backend en deploy contiene el comando de remediación.
- [ ] Confirmar acceso a `docker compose` en servidor objetivo.

### Paso 1 — Respaldo de seguridad (antes de aplicar)
Ejecutar backup lógico de la base `kampus`:

```bash
docker compose exec db sh -lc 'pg_dump -U kampus -d kampus -Fc -f /tmp/kampus_pre_remediation.dump'
docker compose cp db:/tmp/kampus_pre_remediation.dump ./kampus_pre_remediation.dump
```

Validar que el archivo existe y tiene tamaño > 0.

### Paso 2 — Dry-run en entorno objetivo
```bash
docker compose exec backend python manage.py remediate_achievement_bank_links
```

Esperado:
- Resumen con `needs_remediation`, `planned_create`, `planned_relink`.
- Sin errores/excepciones.

### Paso 3 — Aplicar remediación
```bash
docker compose exec backend python manage.py remediate_achievement_bank_links --apply
```

Opcional (si se quiere owner explícito para nuevas definiciones):

```bash
docker compose exec backend python manage.py remediate_achievement_bank_links --apply --owner-username <usuario>
```

### Paso 4 — Validación post-apply (integridad)
Ejecutar auditoría rápida:

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

### Paso 5 — Smoke test funcional
- [ ] Crear logro manual en Planeación y verificar aparición en Banco.
- [ ] Importar logro, editarlo y verificar actualización en Banco.
- [ ] Verificar que IA mejora descripción y regenera indicadores.

### Rollback (si algo sale mal)
1. Detener escrituras de backend (ventana corta de mantenimiento).
2. Restaurar dump previo:

```bash
cat ./kampus_pre_remediation.dump | docker compose exec -T db sh -lc 'pg_restore -U kampus -d kampus --clean --if-exists --no-owner --no-privileges'
```

3. Levantar servicios y revalidar salud del backend.
4. Repetir auditoría para confirmar estado restaurado.

### Registro para auditoría de despliegue
- Fecha/hora de dry-run.
- Resultado numérico de dry-run.
- Fecha/hora de apply.
- Resultado numérico post-apply.
- Evidencia de smoke test.
- Responsable de ejecución.

---

## Estado actual
- Implementación frontend aplicada en `PeriodPlanning.tsx`.
- UX de mejora IA en descripción añadida.
- Sync automático al banco con deduplicación y reintento silencioso activo.
- Pruebas backend `academic` ejecutadas: 67 tests OK.
- Pendiente: ejecución del runbook de QA manual y cierre de checklist funcional.

## Notas de entorno
- Advertencia de versión Node para Vite (recomendado >= 22.12), pero build frontend completado correctamente.
- Advertencia `FutureWarning` de `google.api_core` por Python 3.10 (fin de soporte futuro); no bloquea ejecución actual.

## Referencia de despliegue
- Runbook dedicado: `docs/runbook_remediacion_logros_banco_deploy.md`