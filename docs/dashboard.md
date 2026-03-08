# Plan de rediseño Dashboard Docente + Dashboard Administrativo

Fecha: 2026-03-07  
Estado: En ejecución (implementación iniciada)

## 1) Objetivo
Rediseñar de forma integral los dashboards de **DOCENTE** y **ADMIN/SUPERADMIN** para mejorar:
- experiencia en móvil,
- experiencia en iPad (portrait y landscape),
- administración de espacios (densidad, jerarquía visual, reducción de scroll innecesario),
- toma de decisiones rápida con KPIs y widgets accionables.

## 2) Alcance confirmado
- Roles objetivo del rediseño:
  - DOCENTE
  - ADMIN / SUPERADMIN
- Alcance técnico:
  - `kampus_frontend/src/pages/DashboardHome.tsx`
  - `kampus_frontend/src/layouts/DashboardLayout.tsx`
  - Servicios frontend necesarios para consumo de datos existentes.
- Responsive objetivo:
  - móvil (320px+)
  - iPad portrait (~768px)
  - iPad landscape (~1024px)
  - escritorio (1280px+)

## 3) No alcance (fase actual)
- Rediseño de módulos secundarios completos (listas, formularios) fuera del dashboard.
- Reemplazo global del sistema de diseño.
- Cambio de permisos por rol (se mantienen reglas actuales).

## 4) Principios UX del rediseño
- Prioridad por tareas críticas del rol (no por volumen de información).
- Densidad adaptativa por dispositivo: tarjetas compactas en móvil, mayor simultaneidad en iPad/desktop.
- Jerarquía clara:
  1) Estado operativo del día,
  2) KPIs principales,
  3) Acciones rápidas,
  4) Actividad/seguimiento.
- Estados consistentes en widgets:
  - loading,
  - vacío,
  - error,
  - normal.
- Tap targets adecuados para móvil (botones y celdas accionables de al menos alto cómodo).

## 5) Arquitectura de información objetivo
### Dashboard docente
- Encabezado operativo del día (estado general + pendientes).
- KPIs docentes (rendimiento, planeación, fichas, planillas).
- Bloque “Foco docente del día” (riesgo, pendientes y acciones inmediatas).
- Actividad reciente + accesos rápidos.
- Actividades del plan operativo y fechas importantes.

### Dashboard administrativo
- Encabezado operativo institucional.
- KPIs de volumen (estudiantes/docentes/grupos/notificaciones).
- Centro de control administrativo (widgets de capacidad y salud operativa).
- Actividad reciente + accesos rápidos.
- Alertas y tiempos (pendientes operativos / agenda).

## 6) Componentes y widgets sugeridos (priorizados)

### Prioridad alta (Sprint 1-2)
1. **KPI Cards base**
   - valor,
   - descripción corta,
   - acción al detalle.
2. **Widget de salud de notificaciones**
   - estado: Estable / Atención / Crítico,
   - descripción de impacto,
   - CTA a bandeja.
3. **Foco del día (docente)**
   - riesgo académico,
   - planeación pendiente,
   - notificaciones,
   - planillas pendientes.
4. **Centro de control (admin)**
   - carga por docente,
   - tamaño promedio de grupo,
   - cobertura docente.

### Prioridad media (Sprint 3)
5. **Tendencia 7/30 días**
   - notificaciones pendientes,
   - ejecución de actividades operativas.
6. **Widget de pendientes críticos**
   - top pendientes por prioridad/antigüedad.
7. **Checklist operativo diario**
   - acciones rápidas con estado de cumplimiento.

### Prioridad baja (Sprint 4)
8. **Atajos personalizados por usuario**
9. **Resumen de cumplimiento por área**
10. **Insights sugeridos (texto corto contextual)**

## 7) Plan por sprints

## Sprint 1 — Base visual, responsive y estructura por rol
### Meta
Consolidar la nueva estructura visual del dashboard para docente y admin con foco en mobile+iPad.

### Backlog
- [x] Reorganizar jerarquía del dashboard por rol.
- [x] Ajustar grid para mobile / iPad / desktop.
- [x] Mejorar espaciado y densidad en tarjetas principales.
- [x] Unificar encabezado operativo y estado del día.
- [x] Optimizar layout contenedor para iPad landscape (sidebar persistente en 1024+).

### Entregables
- DashboardHome reorganizado y responsive.
- Layout con mejor administración de espacios para iPad.

### Criterio de salida
- No hay overflow horizontal en móvil/iPad.
- Información crítica visible en primer scroll en iPad.

---

## Sprint 2 — Widgets críticos por rol
### Meta
Entregar widgets de alta prioridad para decisión rápida y operación diaria.

### Backlog
- [x] Implementar “Foco docente del día”.
- [x] Implementar “Centro de control administrativo”.
- [x] Integrar estado de salud de notificaciones.
- [x] Mantener accesos rápidos accionables por rol.
- [x] Corregir visibilidad de fechas importantes para docente con periodos académicos activos.

### Entregables
- Widgets críticos operativos en ambos dashboards.

### Criterio de salida
- Un usuario identifica pendientes prioritarios en menos de 10 segundos.

---

## Sprint 3 — Profundización KPI + analítica operativa
### Meta
Agregar módulos de tendencia y seguimiento para decisiones semanales/mensuales.

### Backlog
- [x] Evaluar endpoint agregado para dashboard admin (evitar dependencia de conteos por listados).
- [x] Implementar tendencia 7/30 días para notificaciones y actividades.
- [x] Añadir widget “pendientes críticos” con semáforos.
- [x] Definir esquema de actualización (manual + refresco controlado).

### Entregables
- Versión KPI extendida de dashboard admin/docente.
- Widget operativo “Tendencia 7/30 días” en dashboard administrativo con:
  - proporción actividades próximas (7 días vs 30 días),
  - proporción notificaciones no leídas recientes (7 días vs 30 días),
  - barras de progreso para lectura rápida.
- Widget operativo “Pendientes críticos” en dashboard administrativo con:
  - semáforo por volumen de notificaciones pendientes,
  - semáforo por actividades para hoy,
  - semáforo por actividades en ventana corta (1-3 días),
  - semáforo por actividades sin responsable asignado.
- Esquema de refresco implementado en dashboard administrativo:
  - botón manual “Actualizar panel”,
  - auto-refresh controlado cada 2 minutos,
  - pausa natural cuando la pestaña no está visible,
  - indicador de última actualización en la cabecera del resumen.
- Endpoint agregado implementado para dashboard administrativo:
  - `GET /api/notifications/admin-dashboard-summary/`
  - incluye conteos de notificaciones no leídas, tendencia 7/30, pendientes críticos de plan operativo y lista próxima de actividades.

### Criterio de salida
- KPIs de tendencia disponibles y consistentes con datos de origen.

---

## Sprint 4 — Hardening, accesibilidad, performance y release
### Meta
Cerrar calidad de experiencia y operación para salida estable.

### Backlog
- [x] Auditoría de accesibilidad (foco, contraste, navegación teclado) en `DashboardHome`.
- [x] Optimización de render y carga de widgets.
- [x] QA manual por breakpoints y por rol.
- [x] Ajustes de microcopy y vacíos operativos.
- [x] Checklist de release y seguimiento post-despliegue.

### Entregables
- Dashboard listo para operación continua.

### Criterio de salida
- Sin bloqueantes críticos de UX, performance o funcionalidad.

### Evidencia de cierre Sprint 4
- **Performance/render**
  - Consolidación de métricas de plan operativo en un único cómputo memoizado para evitar filtros repetidos por render.
  - Cálculo de tendencia de notificaciones (7/30 días) en una sola iteración sobre elementos no leídos.
- **Microcopy/estados vacíos**
  - Actividad reciente: mensaje de vacío más accionable para revisión histórica.
  - Plan operativo: estado vacío con CTA directo para gestión administrativa.
  - Fechas importantes (docente): mensaje contextualizado al año activo.
- **QA responsive por rol (manual)**
  - Docente: validación visual en móvil (320+), iPad portrait (~768), iPad landscape (~1024).
  - Administrativo: validación visual en móvil (320+), iPad portrait (~768), iPad landscape (~1024).
  - Confirmado: sin overflow horizontal y con navegación/acciones primarias operativas.
- **Checklist release**
  - Lint frontend ejecutado sin errores.
  - Verificación de errores de `DashboardHome.tsx` sin incidencias.
  - Auto-refresh administrativo con pausa por pestaña oculta y refresco manual validado.

## 8) Criterios de aceptación responsive
- Móvil:
  - tarjetas en 1 columna,
  - acciones primarias con toque cómodo,
  - navegación sin solapamientos.
- iPad portrait:
  - KPIs en 2 columnas,
  - secciones críticas sin colapsar legibilidad.
- iPad landscape:
  - navegación lateral estable,
  - contenido principal con mayor simultaneidad de widgets.
- Desktop:
  - distribución multicolumna con densidad controlada.

## 9) Riesgos y mitigaciones
- Riesgo: saturación visual por exceso de widgets.  
  Mitigación: priorización por sprint y límites por viewport.

- Riesgo: métricas administrativas con costo de consulta alto.  
  Mitigación: evaluar endpoint agregado para dashboard admin (Sprint 3).

- Riesgo: inconsistencia entre datos operativos y tarjetas KPI.  
  Mitigación: validación cruzada y estados de error explícitos.

## 10) Validación técnica mínima
- Frontend lint:
  - `cd kampus_frontend && npm run lint`
- Validación manual:
  - Dashboard docente en móvil, iPad portrait, iPad landscape.
  - Dashboard admin en móvil, iPad portrait, iPad landscape.
  - Flujos de navegación en accesos rápidos y actividad reciente.

---
Documento vivo de ejecución para el rediseño de dashboards docente y administrativo, con trazabilidad por sprint y prioridades de widgets/componentes.