# Kampus

Plataforma integral de gestión escolar para instituciones educativas en Colombia.

![Monorepo](https://img.shields.io/badge/Arquitectura-Monorepo-334155)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-0ea5e9)
![Backend](https://img.shields.io/badge/Backend-Django%20REST-7c3aed)
![DB](https://img.shields.io/badge/DB-PostgreSQL-336791)

## Qué incluye

- Backend API en Django + Django REST Framework.
- Frontend SPA en React + TypeScript + Vite.
- PostgreSQL + Redis para persistencia y colas.
- Workers/schedulers para tareas asíncronas (Celery y comandos periódicos).

## Estructura del monorepo

```text
kampus/
├─ backend/             # API Django, apps de dominio y comandos
├─ kampus_frontend/     # SPA React + Vite
├─ docs/                # Guías operativas y funcionales
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ env.backend.example
└─ env.frontend.example
```

## Requisitos

- Docker + Docker Compose (recomendado)
- Node.js 20+ (si trabajas frontend fuera de Docker)
- Python 3.10+ (si trabajas backend fuera de Docker)

## Inicio rápido (recomendado)

1. Clona el repositorio.
2. Levanta la plataforma:

```bash
docker compose up --build
```

3. Abre:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

> [!NOTE]
> El contenedor de backend ejecuta migraciones automáticamente cuando `KAMPUS_RUN_MIGRATIONS=true`.

## Variables de entorno

- Backend: copia `env.backend.example` a tu archivo local de entorno.
- Frontend: copia `env.frontend.example` y ajusta `VITE_API_BASE_URL` si aplica.

> [!IMPORTANT]
> No hardcodees secretos en código. Usa variables de entorno (`DJANGO_SECRET_KEY`, `GOOGLE_API_KEY`, credenciales de proveedores, etc.).

## Desarrollo local sin Docker

### Backend

```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell
pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver
```

### Frontend

```bash
cd kampus_frontend
npm install
npm run dev
```

## Comandos útiles

### Backend tests

```bash
python backend/manage.py test
```

### Frontend lint

```bash
cd kampus_frontend
npm run lint
```

### Task de monitoreo de notificaciones (VS Code)

```bash
docker compose exec -T backend python manage.py report_notifications_kpis --hours 24 --format json
docker compose exec -T backend python manage.py check_notifications_health --hours 24 --no-fail-on-breach
```

## Módulos funcionales

- Académico (periodos, calificaciones, promoción)
- Asistencia (sesiones, KPIs, seguimiento)
- Estudiantes (matrícula, ficha, certificados)
- Convivencia (observador y disciplina)
- Novedades, Reportes y Gobierno escolar

## Documentación clave

- [Descripción funcional](docs/descripcion.md)
- [Guía de despliegue con Docker](docs/guia_deploy_vultr_docker.md)
- [Guía de notificaciones por correo](docs/guia_notificaciones_correo_estandar.md)
- [Guía de operación SLA de notificaciones](docs/guia_operacion_notificaciones_sla.md)
- [Plan de sprints KPI de asistencias](docs/plan_sprints_proceso_asistencia_kpis_2026-03-07.md)

