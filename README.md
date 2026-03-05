# Kampus

> Plataforma integral de gestión escolar para instituciones educativas en Colombia.

![Estado](https://img.shields.io/badge/Estado-En%20producci%C3%B3n-16a34a)
![Monorepo](https://img.shields.io/badge/Arquitectura-Monorepo-334155)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-0ea5e9)
![Backend](https://img.shields.io/badge/Backend-Django%20REST-7c3aed)

## ✨ ¿Qué es Kampus?

Kampus centraliza la operación académica y administrativa del colegio en una sola plataforma: estudiantes, docentes, calificaciones, asistencia, convivencia, reportes y gobierno escolar.

Está diseñado para que el equipo directivo y operativo tenga trazabilidad, control y procesos estandarizados durante todo el año lectivo.

## 🚀 Inicio rápido

### Opción recomendada (todo en Docker)

```bash
docker-compose up --build
```

### Perfil de producción (override)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

> Usa el override `docker-compose.prod.yml` para forzar `DJANGO_ENV=production`, hardening HTTPS/cookies y defaults seguros.

Luego abre:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## 🧩 Módulos principales

- **Académico:** periodos, notas, promoción y seguimiento.
- **Estudiantes:** ficha, matrícula, certificados y trazabilidad.
- **Docentes y usuarios:** gestión de perfiles, roles y permisos.
- **Convivencia:** observador estudiantil y casos disciplinarios.
- **Asistencia:** sesiones, control y cierres automáticos.
- **Novedades:** flujo de registro, revisión y cierre.
- **Reportes:** generación de informes operativos y académicos.
- **Gobierno escolar:** elecciones, censo, candidatos y resultados.

## 📰 Novedades y changelog

- **Último changelog publicado:** [Sincronización de planeación (2026-02-16)](docs/changelog_release_2026-02-16_planning-sync.md)
- **Auditoría reciente de votaciones:** [Informe de auditoría (2026-02-18)](docs/informe_auditoria_votaciones_2026-02-18.md)

> Sugerencia: mantén esta sección actualizada en cada release para que el historial sea visible desde la portada.

## 📚 Guías por tema (detalle técnico)

### Deploy y operación

- [Guía de deploy en Vultr con Docker](docs/guia_deploy_vultr_docker.md)
- [Guía de reportes PDF asíncronos (incluye troubleshooting de /media)](docs/guia_reportes_pdf_async_jobs.md)
- [Runbook jornada de votaciones](docs/runbook_jornada_votaciones_gobierno_escolar.md)
- [Runbook verificación QR](docs/runbook_verificacion_qr.md)
- [Runbook remediación de logros](docs/runbook_remediacion_logros_banco_deploy.md)
- [Runbook de release seguro](docs/runbook_release_seguridad.md)
- [Runbook Mailgun (email transaccional + marketing)](docs/runbook_mailgun_operacion.md)
- [Guía estandarizada de notificaciones por correo](docs/guia_notificaciones_correo_estandar.md)
- [Guia de configuracion WhatsApp con Meta Cloud API](docs/guia_configuracion_whatsapp_meta_cloud_api.md)
- [Guía deploy Vultr: corte a producción de correo (Mailgun)](docs/guia_deploy_vultr_docker.md#corte-a-producción-de-correo-mailgun)
- [Checklist de cierre de auditoría de seguridad](docs/checklist_cierre_auditoria_seguridad_2026-02-23.md)

### Funcional y producto

- [Descripción general del producto](docs/descripcion.md)
- [Plan de votaciones](docs/Plan%20de%20votaciones.md)
- [Modo actividades y notas](docs/modo_actividades_notas.md)
- [Guía comisiones de evaluación y promoción](docs/guia_comisiones_evaluacion_promocion_operacion.md)

### Implementación y planes

- [Plan módulo novedades estudiantes](docs/plan_modulo_novedades_estudiantes.md)
- [Plan modo actividades/notas](docs/plan_modo_actividades_notas.md)
- [Plan verificación de documentos QR](docs/plan_verificacion_documentos_qr.md)
- [Plan mejora PDFs asíncronos](docs/plan_mejora_pdfs_weasyprint_async.md)

## 👥 ¿Para quién está pensado?

- Equipos directivos y coordinaciones académicas.
- Personal administrativo escolar.
- Docentes con carga de evaluación y seguimiento.
- Equipos técnicos que despliegan y mantienen la plataforma.

## 🗂️ Estructura general del repositorio

```text
kampus/
├─ backend/
├─ kampus_frontend/
├─ docs/
├─ docker-compose.yml
├─ env.backend.example
└─ env.frontend.example
```

## 🔐 Configuración y seguridad

Para variables de entorno, autenticación, puertos, servicios y comandos técnicos, usa estas referencias:

- [Compartir datos para desarrollo](docs/compartir_data_dev.md)
- [Guía de deploy](docs/guia_deploy_vultr_docker.md)
- [Formato oficial de informes IA](docs/formato_oficial_informe_ia.md)

## 🤝 Contribución

Si vas a implementar cambios:

1. Documenta el alcance funcional en `docs/`.
2. Mantén actualizado el changelog de la release.
3. Verifica que frontend y backend compilen correctamente antes de publicar.

## Licencia

Proyecto bajo licencia MIT.

