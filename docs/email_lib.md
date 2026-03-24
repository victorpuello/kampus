# Plan de adopcion de React Email en Kampus

Fecha: 23-03-2026
Estado: Planeacion aprobable para ejecucion
Fuente de verdad acordada: Codigo (React Email)
Estrategia de render acordada: Precompilado build-time (sin Node en runtime Django)
Alcance acordado: Migracion total de plantillas actuales

## 1) Objetivo
Adoptar React Email para estandarizar y versionar la autoria de plantillas, manteniendo intacta la capa de envio backend (idempotencia, supresion, trazabilidad, headers de marketing, webhooks y auditoria).

## 2) Metas globales chequeables
- [ ] Todas las plantillas activas quedan definidas en codigo React Email.
- [ ] El backend sigue enviando con la misma interfaz (send_email y send_templated_email) sin regresiones funcionales.
- [ ] No se introduce Node en runtime del backend.
- [ ] Existe sincronizacion determinista Codigo -> BD para EmailTemplate.
- [ ] Se conserva cumplimiento legal/comercial (unsubscribe one-click, opt-in, supresiones, disclaimer).
- [ ] Se documenta runbook de cambios, pruebas y rollback.

## 3) Supuestos y limites de alcance
Incluido:
- Pipeline de precompilado de plantillas.
- Sincronizacion idempotente a EmailTemplate.
- Migracion de todos los slugs actuales.
- Verificacion funcional y operativa por entorno.

Excluido:
- Cambio de proveedor de correo (Mailgun se mantiene).
- Reescritura de send_email o de la logica de webhooks.
- Replanteamiento del dominio de notificaciones.

## 4) Dependencias tecnicas clave
Backend:
- backend/communications/template_service.py
- backend/communications/email_service.py
- backend/communications/models.py
- backend/communications/views.py
- backend/communications/urls.py

Frontend:
- kampus_frontend/package.json
- kampus_frontend/scripts/generate-seo-files.mjs (patron)

Operacion:
- docs/guia_notificaciones_correo_estandar.md
- docs/runbook_mailgun_operacion.md

## 5) Plan por sprints

## Estado de implementacion (23-03-2026)
- [x] Sprint 1 base tecnica: modulo React Email y precompilado activo en frontend.
- [x] Artefacto generado: kampus_frontend/email-templates/dist/templates.json.
- [x] Comando backend creado: backend/communications/management/commands/sync_email_templates_from_artifact.py.
- [x] Validacion del comando en seco (dry-run) ejecutada correctamente.
- [x] Endpoint admin de sincronizacion: /api/communications/settings/email-templates/sync/.
- [x] Sincronizacion real a BD en entorno dev/staging.
- [x] Politica de bloqueo de edicion manual para slugs gestionados por codigo (API).
- [x] Bloqueo visual en UI para slugs managed_by_code + acciones de sincronizacion desde panel.
- [x] Smoke test post-sync de render (password-reset + marketing-campaign-generic) en verde.
- [x] CI gate agregado para artifact drift + sync dry-run automatizado.

Comandos operativos actuales:
1. Generar artefacto React Email:
	cd kampus_frontend && npm run build:emails
2. Ver diff de sincronizacion sin persistir cambios:
	python backend/manage.py sync_email_templates_from_artifact --dry-run
3. Sincronizar en BD (persistente):
	python backend/manage.py sync_email_templates_from_artifact
4. Sincronizar y desactivar slugs ausentes en artefacto:
	python backend/manage.py sync_email_templates_from_artifact --deactivate-missing

## Sprint 0 - Descubrimiento y contrato tecnico (1 semana)
Objetivo:
Alinear contrato funcional de plantillas y cerrar inventario total de slugs/variables antes de construir.

Entregables:
- Matriz de slugs actuales con origen, uso y criticidad.
- Contrato formal de salida por plantilla (subject_template, body_html_template, body_text_template).
- Lista de variables permitidas por slug y reglas de validacion.

Tareas:
1. Inventariar todos los slugs de EmailTemplate (BD + defaults).
2. Mapear consumidores por dominio (auth, notifications, academic, etc.).
3. Definir esquema de props tipadas por plantilla en React Email.
4. Definir politica para placeholders requeridos (errores en build si faltan).

Metas chequeables (DoD Sprint 0):
- [ ] 100% de slugs actuales inventariados.
- [ ] 100% de slugs con variables definidas y validadas.
- [ ] Documento de contrato aprobado por backend + frontend.

Riesgo principal:
Drift de variables entre componentes y render Django.
Mitigacion:
Validacion automatica del artefacto generado contra variables esperadas por slug.

## Sprint 1 - Fundacion React Email y pipeline local (1 semana)
Objetivo:
Crear base tecnica para autoria de plantillas y generacion automatica de artefactos.

Entregables:
- Modulo email-templates en frontend.
- Registro tipado slug -> componente.
- Script Node de precompilado a JSON (subject/text/html por slug).

Tareas:
1. Agregar dependencias React Email y utilidades de render.
2. Crear estructura de carpetas para componentes y tokens de estilo.
3. Implementar script render-email-templates basado en patron de scripts existentes.
4. Incluir validacion de placeholders requeridos y salida determinista.

Metas chequeables (DoD Sprint 1):
- [ ] Comando local de generacion ejecuta sin errores.
- [ ] Se genera artefacto unico y versionable.
- [ ] Los slugs compilados coinciden con el inventario aprobado.

Riesgo principal:
Inconsistencias HTML entre clientes de correo.
Mitigacion:
Usar componentes compatibles de React Email y pruebas de render por template.

## Sprint 2 - Migracion total de plantillas y sincronizacion BD (1 semana)
Objetivo:
Migrar todos los templates a componentes React Email y sincronizarlos en EmailTemplate.

Entregables:
- Componentes para todos los slugs activos.
- Mecanismo idempotente de sync Codigo -> BD.
- Politica de bloqueo de edicion manual para slugs gestionados por codigo.

Tareas:
1. Implementar componente por cada slug del inventario.
2. Generar artefacto completo y validar placeholders por slug.
3. Crear migracion/comando de sincronizacion idempotente.
4. Definir bandera o metadata de template gestionado por codigo.

Metas chequeables (DoD Sprint 2):
- [ ] 100% de slugs migrados a React Email.
- [ ] 100% de registros EmailTemplate sincronizados sin duplicados.
- [ ] No hay diferencias funcionales en subject/text/html esperados.

Riesgo principal:
Sobrescribir customizaciones productivas vigentes.
Mitigacion:
Backup previo de EmailTemplate y estrategia de rollback por slug.

## Sprint 3 - Compatibilidad funcional y no regresion (1 semana)
Objetivo:
Demostrar que la migracion no afecta envio, compliance ni observabilidad.

Entregables:
- Evidencia de no regresion en pruebas backend.
- Evidencia operativa E2E (transaccional, notificacion, marketing).
- Checklist de seguridad/compliance verificado.

Tareas:
1. Ejecutar tests focalizados de communications/notifications.
2. Validar endpoints de preview/test por slug.
3. Probar casos criticos: password-reset, notificacion operativa, marketing opt-in/out.
4. Confirmar trazabilidad en EmailDelivery, EmailEvent, EmailSuppression.

Metas chequeables (DoD Sprint 3):
- [ ] Test suite focalizada en verde.
- [ ] Casos E2E criticos con estado SENT (cuando aplica).
- [ ] Headers de unsubscribe presentes en categorias marketing.
- [ ] Supresiones y reglas de opt-in conservadas.

Riesgo principal:
Regresiones silenciosas en textos/variables por template.
Mitigacion:
Snapshots del artefacto por slug y diff obligatorio en PR.

## Sprint 4 - Hardening, CI/CD y rollout por entornos (1 semana)
Objetivo:
Cerrar operacion, gobierno y despliegue controlado a produccion.

Entregables:
- Pipeline CI con validaciones de templates.
- Runbook de operacion y rollback actualizado.
- Estrategia de rollout gradual dev -> staging -> prod.

Tareas:
1. Integrar generacion de templates al build y CI.
2. Agregar chequeos de integridad (slugs esperados, placeholders, diff).
3. Actualizar documentacion de operacion y soporte.
4. Ejecutar rollout gradual con monitoreo de metricas de entrega.

Metas chequeables (DoD Sprint 4):
- [ ] CI falla si hay drift o templates invalidos.
- [ ] Runbook actualizado y validado por equipo.
- [ ] Rollout completado sin incremento anomalo de FAILED/SUPPRESSED.

Riesgo principal:
Fallas en despliegue por orden de pasos build/sync.
Mitigacion:
Playbook predeploy con verificaciones obligatorias y rollback rapido.

## 6) Cronograma sugerido
- Sprint 0: Semana 1
- Sprint 1: Semana 2
- Sprint 2: Semana 3
- Sprint 3: Semana 4
- Sprint 4: Semana 5

Total estimado: 5 semanas (con migracion total y verificacion robusta).

## 7) KPI de exito
- Cobertura de migracion: 100% slugs activos en codigo.
- Estabilidad funcional: 0 regresiones en pruebas criticas.
- Calidad operativa: sin incremento significativo de FAILED/SUPPRESSED post-release.
- Gobernanza: 0 cambios manuales no autorizados en slugs gestionados por codigo.

## 8) Checklist final de salida a produccion
- [ ] Inventario y contrato aprobados.
- [ ] Pipeline de generacion en build/CI activo.
- [ ] Sincronizacion Codigo -> BD validada en staging.
- [ ] E2E de transaccional/notificacion/marketing validado.
- [ ] Monitoreo operativo definido y con responsables.
- [ ] Plan de rollback probado.

## 9) Riesgos transversales y mitigaciones
1. Drift codigo-BD:
Mitigar con bloqueo de edicion manual para slugs gestionados por codigo + sync idempotente.
2. Incompatibilidad visual en clientes de correo:
Mitigar con componentes React Email compatibles y pruebas en clientes principales.
3. Perdida de personalizacion previa:
Mitigar con export/backup de EmailTemplate antes de sincronizar.
4. Errores de placeholders:
Mitigar con validacion en build y pruebas de preview/test por slug.

## 10) Criterio de aprobacion del plan
Este plan se considera listo para ejecucion cuando:
- Producto valida prioridades de templates criticos.
- Backend y frontend validan contrato de variables.
- Operaciones valida runbook y estrategia de rollback.

## 11) Day-2 Operacion
Objetivo:
Mantener consistencia entre codigo React Email y la BD sin drift operativo.

Flujo estandar para cambio de plantilla:
1. Editar componente en kampus_frontend/email-templates/src.
2. Ejecutar `cd kampus_frontend && npm run build:emails`.
3. Verificar que no exista drift no intencional en `kampus_frontend/email-templates/dist/templates.json`.
4. Ejecutar `python backend/manage.py sync_email_templates_from_artifact --dry-run`.
5. Si el diff es esperado, ejecutar `python backend/manage.py sync_email_templates_from_artifact`.
6. Validar preview/test para el slug actualizado desde Sistema -> Plantillas.

Runbook de contingencia (rollback rapido):
1. Revertir commit de templates en frontend.
2. Regenerar artifact (`npm run build:emails`).
3. Reaplicar sync backend (`sync_email_templates_from_artifact`).
4. Verificar render de al menos `password-reset` y `marketing-campaign-generic`.

Checklist operativo semanal:
- [ ] Ejecutar sync en seco y confirmar `updated=0` en estado estable.
- [ ] Revisar que CI gate de templates este en verde en PRs de frontend/backend.
- [ ] Confirmar que no existan cambios manuales fuera del flujo code-managed.

## 12) Checklist de merge/deploy
1. [ ] PR incluye cambios de codigo + artifact `templates.json` coherentes.
2. [ ] `npm run build` en frontend pasa local/CI.
3. [ ] `python backend/manage.py test communications.tests.EmailTemplateCodeManagedLockTests communications.tests.MailSettingsAdminTests --noinput` pasa.
4. [ ] CI workflow `Email Templates Sync Gate` en verde.
5. [ ] En staging: correr `sync_email_templates_from_artifact` y validar preview/test de 2 slugs criticos.
6. [ ] En produccion: ejecutar sync, monitorear EmailDelivery/EmailSuppression y confirmar ausencia de errores de render.
