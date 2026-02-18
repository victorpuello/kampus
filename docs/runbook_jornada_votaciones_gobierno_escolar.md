## Runbook operativo: Jornada de Votaciones (Gobierno Escolar)

Última actualización: 2026-02-17

### 1) Objetivo
Operar una jornada electoral de punta a punta en Kampus, con control de apertura, contingencias, monitoreo y cierre.

### 2) Roles operativos
- **Administrador / Superadmin**: configura jornada, abre/cierra, gestiona contingencias críticas.
- **Jurado**: apoyo en mesa, validación de identidad operativa, escalamiento de incidencias.
- **Soporte técnico**: conectividad, dispositivos y recuperación rápida ante fallas.

### 3) Preapertura (T-60 a T-15 min)
1. Ingresar al módulo en `/gobierno-escolar/procesos`.
2. Verificar que exista jornada en estado `DRAFT` o `OPEN` según planeación.
3. En pestaña `Cargos`, confirmar presencia de:
   - `PERSONERO`
   - `CONTRALOR`
4. En pestaña `Candidatos`, validar:
   - Personería: candidaturas con grado 11.
   - Contraloría: candidaturas con grado 6 a 11.
5. Verificar disponibilidad de tokens/QR para la mesa.
6. Realizar prueba controlada con 1 token de verificación interna.

### 4) Apertura de jornada (T-0)
1. En `Jornadas`, ejecutar acción **Abrir jornada**.
2. Confirmar que estado cambie a `OPEN`.
3. Registrar hora de apertura en acta operativa.
4. Habilitar atención de votantes en `/votaciones`.

### 5) Operación en jornada (T+0 a cierre)

#### Flujo estándar por votante
1. Votante accede a `/votaciones`.
2. Escanea QR o ingresa token manual.
3. Selecciona candidaturas por cargo.
4. Confirma envío.
5. Sistema invalida token (uso único).

#### Contingencias autorizadas
1. Si token inválido/expirado/no usable, jurado o admin accede a `/votaciones/reset-token`.
2. Registrar motivo obligatorio del reset.
3. Entregar token reactivado al votante.
4. Verificar registro de auditoría en historial de resets.

#### Monitoreo mínimo cada 30 minutos
- Estado de jornada (`OPEN`).
- Incidencias de tokens (cantidad y tipo).
- Estado de conectividad de dispositivos de votación.
- Escalamiento de casos repetitivos al soporte técnico.

### 6) Cierre de jornada
1. Detener ingreso de nuevos votantes según hora oficial.
2. Ejecutar cierre administrativo de jornada (cuando endpoint/acción de cierre esté habilitado de forma explícita).
3. Confirmar que no se acepten nuevos votos tras cierre.
4. Consolidar reporte interno:
   - Total incidencias.
   - Total resets y motivos.
   - Observaciones de mesa.

### 7) Postjornada
1. Preparar insumos para escrutinio por cargo.
2. Validar consistencia de datos antes de publicación de resultados.
3. Archivar acta operativa y evidencias de contingencia.

### 8) Checklist rápido (uso en campo)
- [ ] Jornada creada y visible.
- [ ] Cargos Personería/Contraloría configurados.
- [ ] Candidatos validados por reglas de grado.
- [ ] Prueba controlada preapertura completada.
- [ ] Jornada en estado `OPEN`.
- [ ] Contingencias gestionadas con motivo.
- [ ] Evidencia de operación y cierre registrada.

### 9) Comandos de verificación técnica recomendados
- Backend:
  - `python backend/manage.py check`
   - `python backend/manage.py sync_election_census --source-active-enrollments` (prevalidación con matrículas activas del año académico activo)
   - `python backend/manage.py sync_election_census --source-active-enrollments --academic-year-id <ID> --apply` (aplicar sincronización para vigencia específica)
   - `python backend/manage.py sync_election_census --source-url https://... --apply` (fuente API institucional externa)
- Frontend:
  - `cd kampus_frontend && npm run lint`

### 10) Notas de alcance actual
- Este runbook cubre la operación con la funcionalidad implementada actualmente.
- El censo electoral ya se valida en el flujo público (`validate-token` y `submit-vote`) con criterios de matrícula activa y grado habilitado (1° a 11°).
- La sincronización de censo soporta tres fuentes: archivo JSON, API HTTP institucional y matrículas activas internas (`Enrollment`).
