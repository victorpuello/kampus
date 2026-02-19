# Auditoría UI/UX — App de Votaciones (Kampus)

Fecha: 2026-02-18  
Alcance: Frontend de votaciones en `kampus_frontend/src/pages` (flujo público y módulos administrativos)  
Pantallas auditadas:
- `VotingAccess.tsx`
- `ElectionProcessesManage.tsx`
- `ElectionRolesManage.tsx`
- `ElectionCandidatesPersoneria.tsx`
- `ElectionCandidatesContraloria.tsx`
- `ElectionCensusManage.tsx`
- `ElectionLiveDashboard.tsx`
- `ElectionTokenReset.tsx`
- navegación y rutas en `App.tsx` y `DashboardLayout.tsx`

---

## 1) Resumen ejecutivo (crítico)

La solución **sí funciona operativamente** y cubre bien el MVP transaccional (token → voto → confirmación), pero en UI/UX presenta deuda relevante para una operación institucional de alto volumen.

### Fortalezas reales
1. **Flujo público claro por pasos** (inicio, escaneo, tarjetón, revisión, éxito).
2. **Buen uso de feedback inmediato** en selección de voto (estado seleccionado, progreso, toasts).
3. **Cobertura administrativa amplia** (jornadas, roles, candidaturas, censo, prevalidación, escrutinio, monitoreo, contingencia).
4. **Mensajes de error funcionales** y estados vacíos básicos en varias pantallas.

### Riesgos UX más importantes
1. **Sobrecarga cognitiva en administración**: la pantalla de jornadas concentra demasiadas tareas críticas con jerarquía débil.
2. **Inconsistencia de interacción y componentes** (`Input` + `<input>` nativo + `<select>` nativo + botones heterogéneos), lo cual reduce predictibilidad.
3. **Baja madurez de accesibilidad** (teclado, foco, roles ARIA, contrastes contextuales, live regions).
4. **Flujos críticos sin barandas UX suficientes** (apertura de jornada, regeneración de códigos, exports y acciones masivas).
5. **Descubribilidad incompleta por rol**: hay permisos funcionales que no coinciden con navegación visible.

---

## 2) Método de auditoría

Se evaluó con heurísticas de usabilidad y operación real:
- Claridad de tarea y arquitectura de información.
- Consistencia visual y de patrones de interacción.
- Prevención de errores y recuperabilidad.
- Estados (vacío, carga, éxito, error, bloqueo).
- Accesibilidad (teclado, semántica, foco, mensajes).
- Eficiencia operativa para administrador/jurado y fricción para votante.

Escala usada: **Excelente / Adecuado / Mejorable / Crítico**.

---

## 3) Diagnóstico por flujo

## 3.1 Flujo público de votación (`/votaciones`)

### Lo que está bien
- Narrativa de entrada amigable y orientada al estudiante.
- Progreso visible por pasos y porcentaje.
- Opción de voto en blanco integrada (no escondida).
- Paso de revisión antes de confirmación.
- FallBack de escaneo a token manual.

### Hallazgos críticos
1. **No hay indicador explícito de “tiempo restante de sesión/token”**.
   - Riesgo: frustración por expiración inesperada cerca de confirmación.
2. **Falta de confirmación fuerte previa al envío final** (double-check explícito de irreversibilidad).
   - Aunque existe pantalla de revisión, el CTA final no tiene confirm modal ni “check de intención”.
3. **Escenario de conectividad inestable no está suficientemente diseñado**.
   - No hay estado “reintentando”, “sin conexión”, ni estrategia visible de recuperación segura.
4. **Gestión de cámara mejorable en UX de fallo**.
   - Se muestra error, pero falta guía paso a paso contextual (permisos por navegador/dispositivo).
5. **Accesibilidad parcial del tarjetón**.
   - Selección visual robusta, pero no se evidencia feedback ARIA (`aria-live`) para lectores de pantalla al cambiar selección.
6. **Candidato sin foto usa gradiente decorativo sin semántica adicional**.
   - Puede afectar identificación rápida en operación real de mesa.

### Qué falta agregar (prioridad alta)
- Contador/estado de vigencia de sesión/token visible en ballot/review.
- Confirmación final reforzada (modal de irreversibilidad + checkbox simple “He revisado mis selecciones”).
- Estado offline/reconexión en submit con política clara de no doble envío.
- Micro-ayuda contextual de cámara por dispositivo (Android/iOS/desktop).
- Soporte de accesibilidad en cambios de selección (`aria-live`, navegación por teclado en lista de candidaturas).

---

## 3.2 Gestión de jornadas / cargos / candidaturas (`/gobierno-escolar/procesos`)

### Lo que está bien
- Consolidación funcional en tabs reduce dispersión de rutas.
- Existen validaciones básicas y confirmación de borrado.
- Se incluyen prevalidación de elegibilidad y escrutinio/exportables dentro del módulo.

### Hallazgos críticos
1. **Pantalla demasiado densa para tareas de alto impacto**.
   - Crear jornada, abrir jornada, editar fechas, prevalidar, consultar escrutinio y exportar conviven en un mismo bloque extenso.
2. **Jerarquía de riesgo insuficiente**.
   - “Abrir jornada” y otras acciones sensibles no tienen tratamiento visual/procedimental diferenciado.
3. **Lenguaje y estructura poco orientados a operación secuencial**.
   - Falta un “paso a paso de jornada” dentro de la UI (preparar → validar → abrir → monitorear → cerrar/escrutar).
4. **Tab de candidatos depende de subtab adicional (Personería/Contraloría)** sin guía contextual de prerequisitos.
5. **Uso amplio de tablas sin utilidades de productividad**.
   - No hay ordenación/filtrado persistente/contextual en tablas clave.

### Qué falta agregar (prioridad alta)
- Separar la gestión en bloques operativos por fase de jornada con checklists visibles.
- Etiquetar acciones críticas con mayor contraste + confirmaciones específicas por impacto.
- “Asistente operacional” corto en la parte superior (estado actual de jornada y próximos pasos recomendados).
- Filtros/orden y búsqueda más homogénea en listados administrativos.

---

## 3.3 Censo electoral (`/gobierno-escolar/censo`)

### Lo que está bien
- Cobertura operativa robusta: sincronización, exclusión/reinclusión, impresión QR, exportación XLSX, búsqueda y paginación.
- Modo de regeneración exige motivo mínimo.

### Hallazgos críticos
1. **Riesgo de error humano en regeneración de códigos**.
   - Confirmación basada en `window.confirm` es débil para impacto alto.
2. **Demasiadas decisiones en un solo bloque superior** (jornada, grupo, modo, paginación, búsqueda, sync, print, export).
3. **Estados de proceso largos poco observables**.
   - No hay barra/progreso ni resumen post-acción estructurado (más allá de texto éxito/error).
4. **Terminología técnica densa para perfiles no técnicos**.
   - “Regenerar códigos” y consecuencias no están encapsuladas en guía clara de impacto.

### Qué falta agregar (prioridad alta)
- Confirmación fuerte para regeneración (modal con resumen de impacto y segunda validación).
- Dividir toolbar en secciones: filtros, acciones de emisión, acciones de mantenimiento.
- Panel de “resultado de operación” con métricas claras (afectados, revocados, nuevos).
- Copys de seguridad operacional más explícitos antes de acciones masivas.

---

## 3.4 Monitoreo en vivo (`/gobierno-escolar/monitoreo`)

### Lo que está bien
- KPI funcional completo (participación, blancos, alertas y métricas técnicas).
- Opción polling/SSE con fallback.
- Ranking y serie por minuto ya presentes.

### Hallazgos críticos
1. **Configuración avanzada expuesta en exceso** para un panel que también debería ser ejecutable por personal operativo.
   - Muchos inputs numéricos juntos sin presets recomendados.
2. **No hay enfoque claro de “alerta accionable”**.
   - Se listan alertas, pero falta recomendación de acción inmediata por tipo.
3. **Jerarquía visual compite entre KPIs de negocio y técnicos**.
   - Puede confundir durante incidentes en jornada activa.
4. **Falta semaforización fuerte y persistente** para estado general de la jornada (salud operativa).

### Qué falta agregar (prioridad media-alta)
- Presets de monitoreo (Conservador / Estándar / Sensible) en lugar de exigir ajuste manual de todos los umbrales.
- Clasificación de alertas por prioridad con “acción sugerida”.
- Vista resumida de “Estado global” (verde/ámbar/rojo) en cabecera.
- Diferenciar visualmente KPIs de negocio vs técnicos en secciones más marcadas.

---

## 3.5 Contingencia reset token (`/votaciones/reset-token`)

### Lo que está bien
- Flujo simple, directo y con motivo obligatorio.
- Historial reciente visible para trazabilidad básica.

### Hallazgos críticos
1. **Descubribilidad por rol inconsistente**.
   - La vista permite COORDINATOR/SECRETARY, pero en navegación el enlace depende de `canManageRbac` (super/admin).
2. **Ausencia de ayudas de validación contextual**.
   - No hay helper para formato esperado de token más allá del placeholder.
3. **Sin diferenciación visual de severidad operacional**.
   - Es un flujo de contingencia crítica pero se ve como formulario estándar.

### Qué falta agregar (prioridad alta)
- Alinear navegación con permisos reales (mostrar opción a roles autorizados).
- Añadir validación/formato guiado del token en tiempo real.
- Diseñar sección de contingencia con señales de alto impacto y checklist breve.

---

## 4) Hallazgos transversales de UI

## 4.1 Consistencia visual y sistema de componentes — **Mejorable**
- Mezcla de componentes UI (`Input`) con controles HTML nativos estilados manualmente.
- Divergencia de alturas/espaciados y densidad entre formularios.
- Patrón de tablas repetido, pero sin una capa común de comportamientos (orden, estado vacío consistente, acciones masivas, sticky headers).

## 4.2 Arquitectura de información — **Crítico en administración**
- El módulo está funcionalmente completo, pero la IA de tareas no está optimizada para estrés operativo.
- Faltan “flujos guiados” dentro de UI para jornada real.

## 4.3 Feedback y prevención de errores — **Mejorable**
- Hay mensajes de error, pero faltan guardrails robustos en operaciones destructivas/masivas.
- Dependencia de mensajes de texto en lugar de paneles de estado estructurados.

## 4.4 Accesibilidad — **Crítico**
- No se evidencia una estrategia consistente de:
  - navegación completa por teclado,
  - `aria-live` para eventos dinámicos,
  - jerarquía semántica uniforme en tablas/acciones,
  - foco visible estandarizado en todos los controles,
  - revisión sistemática de contraste en estados semánticos.

## 4.5 Mobile y operación en campo — **Mejorable**
- Flujo público tiene buena base responsive.
- Módulos administrativos con tablas extensas son difíciles en pantallas pequeñas y escenarios de mesa móvil.

---

## 5) Lista explícita de “faltantes” a agregar

## Faltantes P0 (deberían entrar primero)
1. **Alineación permisos ↔ navegación** para `/votaciones/reset-token`.
2. **Confirmaciones reforzadas** en acciones críticas (abrir jornada, regenerar códigos, submit final de voto).
3. **Estado de sesión/token en flujo público** (vigencia y expiración inminente).
4. **Accesibilidad base obligatoria** (teclado, foco, live regions, contraste, labels/semántica).
5. **Guía operativa embebida** en “Jornadas” con secuencia recomendada de operación.

## Faltantes P1
1. Presets y “modo simple” para monitoreo live.
2. Paneles de resultado post-acción (sync/regeneración/export) con métricas claras.
3. Estandarización de formularios/tablas con componentes únicos reutilizables.
4. Mejoras de resiliencia UX ante red inestable en submit de voto.

## Faltantes P2
1. Densidad adaptable para pantallas pequeñas en módulos admin.
2. Mejoras de microcopy para perfiles no técnicos.
3. Homogeneización de iconografía/estados semánticos en todo el módulo.

---

## 6) Plan de mejora recomendado (30 días)

### Semana 1 (impacto alto, bajo esfuerzo)
- Corregir discoverabilidad por rol de reset token.
- Añadir confirmaciones robustas para acciones críticas.
- Incorporar indicador de sesión/token en votación pública.
- Ajustar microcopys de riesgo.

### Semana 2
- Refactor de `ElectionProcessesManage` en bloques operativos por fase.
- Unificar controles de formulario (reducir mezcla nativo/componente).
- Definir patrón único de feedback (error/success/loading) por tarjeta.

### Semana 3
- Accesibilidad transversal: teclado, foco, ARIA, live regions, revisión de contraste.
- Ajustes de responsive para tablas administrativas clave.

### Semana 4
- Monitoreo live: presets, estado global y alertas con acción sugerida.
- Hardening UX de operaciones masivas en censo.

---

## 7) Veredicto final

La app de votaciones está **sólida en funcionalidad base**, pero para una experiencia institucional madura necesita pasar de “pantallas funcionales” a “operación guiada y segura por diseño”.

### Prioridad estratégica
Si solo se pueden ejecutar 3 mejoras inmediatas:
1. Guardrails UX en acciones críticas.
2. Accesibilidad y consistencia de componentes.
3. Reestructuración de la pantalla de jornadas por fases operativas.

Con esos tres frentes, la calidad percibida y la seguridad operacional del módulo mejoran de forma visible y medible.