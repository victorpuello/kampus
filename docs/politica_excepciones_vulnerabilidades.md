# Política de Excepciones de Vulnerabilidades (SCA/SAST)

## Objetivo
Permitir releases controlados cuando exista una vulnerabilidad conocida que no pueda mitigarse de inmediato, sin perder trazabilidad ni responsabilidad.

## Alcance
Aplica a hallazgos de:
- `pip-audit` (dependencias Python)
- `npm audit` (dependencias frontend)
- `bandit` (SAST backend)

## Regla general
- No se aprueban excepciones para hallazgos **Critical** con exploit conocido y vector expuesto a internet.
- Toda excepción debe tener fecha de vencimiento y plan de remediación.

## Criterios mínimos para aprobar una excepción
1. **Justificación técnica**: por qué no se puede corregir en este release.
2. **Impacto evaluado**: alcance real en Kampus (explotable/no explotable).
3. **Controles compensatorios**: mitigaciones temporales aplicadas.
4. **Owner asignado**: responsable nominal.
5. **Fecha de vencimiento**: máximo 30 días para High, 14 días para Critical (si excepcionalmente se permite).

## Formato obligatorio de registro
Registrar cada excepción en el PR y en el changelog interno con este bloque:

```text
ID: EXC-YYYYMMDD-<secuencia>
Herramienta: pip-audit | npm audit | bandit
Severidad: High | Critical
Paquete/Regla: <nombre>
Versión afectada: <versión>
Referencia: <CVE/GHSA/Bandit-ID>
Justificación: <texto breve>
Impacto en Kampus: <explotable/no explotable + contexto>
Control compensatorio: <medida aplicada>
Owner: <nombre/rol>
Fecha compromiso remediación: <YYYY-MM-DD>
Estado: Activa | Cerrada
```

## Flujo operativo
1. El pipeline detecta hallazgo (SCA/SAST).
2. El equipo técnico valida explotabilidad real.
3. Si no es remediable en el release actual, se propone excepción con formato obligatorio.
4. Aprobación mínima: líder técnico + responsable de producto/operación.
5. Se publica release solo si la excepción queda documentada y vigente.
6. Seguimiento semanal hasta cierre.

## Cierre de excepción
Una excepción se cierra cuando:
- se actualiza dependencia/regla afectada, y
- el pipeline deja de reportar el hallazgo, y
- se actualiza estado a `Cerrada` con evidencia (job/link/commit).

## Reglas de caducidad
- Excepción vencida = release bloqueado hasta renovación formal o remediación.
- Máximo 2 renovaciones por excepción, con nueva justificación y aprobación.
