# Registro de Excepciones de Vulnerabilidades

## EXC-20260321-001
ID: EXC-20260321-001
Herramienta: npm audit
Severidad: High
Paquete/Regla: xlsx
Version afectada: 0.18.5
Referencia: GHSA-4r6h-8v6p-xvw6
Justificacion: La dependencia xlsx es requerida para flujos operativos de censo y exportacion electoral; no existe version corregida disponible aguas arriba.
Impacto en Kampus: Explotable solo con interaccion y archivos controlados por usuarios autenticados; se limita su uso a vistas internas de gestion.
Control compensatorio: Gate CI mantiene bloqueo para cualquier High/Critical adicional; excepcion expira y fuerza reevaluacion.
Owner: Equipo Plataforma (Seguridad + Frontend)
Fecha compromiso remediacion: 2026-04-20
Estado: Activa

## EXC-20260321-002
ID: EXC-20260321-002
Herramienta: npm audit
Severidad: High
Paquete/Regla: xlsx
Version afectada: 0.18.5
Referencia: GHSA-5pgg-2g8v-p4x9
Justificacion: La dependencia xlsx es requerida para flujos operativos de censo y exportacion electoral; no existe version corregida disponible aguas arriba.
Impacto en Kampus: Riesgo de ReDoS acotado al procesamiento local de archivos en interfaz de gestion autenticada.
Control compensatorio: Gate CI mantiene bloqueo para cualquier High/Critical adicional; excepcion expira y fuerza reevaluacion.
Owner: Equipo Plataforma (Seguridad + Frontend)
Fecha compromiso remediacion: 2026-04-20
Estado: Activa
