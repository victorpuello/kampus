# Kampus

Plataforma integral de gestión escolar para instituciones educativas en Colombia.

## Descripción

Kampus es un monorepo con:

- Backend API en Django + Django REST Framework.
- Frontend SPA en React + TypeScript + Vite.
- Servicios auxiliares para colas, tareas programadas y cache.

El sistema cubre procesos académicos, usuarios/roles, convivencia, asistencia, reportes, novedades y gobierno escolar (votaciones).

## Arquitectura

- Backend: `backend/`
- Frontend: `kampus_frontend/`
- Base de datos: PostgreSQL (Docker) o SQLite (fallback local)
- Cola y cache: Redis
- Worker async: Celery
- Scheduler: tareas periódicas (discipline, attendance, reportes, sync de censo electoral)

## Stack tecnológico

### Backend

- Python 3.10+
- Django 5
- Django REST Framework
- SimpleJWT
- PostgreSQL / SQLite
- Celery + Redis

### Frontend

- React 19
- React Router 7
- TypeScript
- Vite 7
- Tailwind CSS 4
- Zustand
- Axios

## Estructura del repositorio

```text
kampus/
├─ backend/
│  ├─ manage.py
│  ├─ requirements.txt
│  ├─ entrypoint.sh
│  ├─ kampus_backend/
│  ├─ academic/
│  ├─ attendance/
│  ├─ audit/
│  ├─ communications/
│  ├─ config/
│  ├─ core/
│  ├─ discipline/
│  ├─ elections/
│  ├─ novelties/
│  ├─ notifications/
│  ├─ reports/
│  ├─ students/
│  ├─ teachers/
│  └─ users/
├─ kampus_frontend/
│  ├─ src/
│  ├─ package.json
│  └─ vite.config.ts
├─ docs/
├─ docker-compose.yml
├─ env.backend.example
└─ env.frontend.example
```

## Ejecución rápida (recomendada)

### Docker Compose (full stack)

```bash
docker-compose up --build
```

Servicios y puertos:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Servicios levantados por defecto:

- `backend`
- `backend_worker`
- `backend_scheduler`
- `frontend`
- `db`
- `redis`

Notas del backend en Docker:

- Si `KAMPUS_RUN_MIGRATIONS=true`, corre migraciones al iniciar.
- Si `KAMPUS_CREATE_SUPERUSER=true`, crea superusuario dev (`admin` / `admin123`).

## Ejecución manual

### 1) Backend

```bash
python -m venv .venv

# Linux/macOS
source .venv/bin/activate

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver
```

### 2) Frontend

```bash
cd kampus_frontend
npm install
npm run dev
```

## Variables de entorno

- Backend base: `env.backend.example`
- Frontend base: `env.frontend.example`

Convenciones importantes:

- Si `POSTGRES_DB` está definido, Django usa PostgreSQL; si no, puede usar SQLite.
- `VITE_API_BASE_URL` define a qué backend se conecta la SPA.
- No hardcodear secretos (por ejemplo `GOOGLE_API_KEY`).

## Autenticación

Endpoints JWT principales:

- `POST /api/token/`
- `POST /api/token/refresh/`

Además, existen endpoints de auth por cookie:

- `GET /api/auth/csrf/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `POST /api/auth/logout/`

## Módulos principales

- Académico: años, periodos, escalas, calificaciones.
- Estudiantes: ficha, matrícula, certificados.
- Docentes y usuarios: gestión y permisos.
- Convivencia: observador, casos y trazabilidad.
- Asistencia: sesiones y cierres automáticos.
- Reportes: generación y limpieza de jobs.
- Novedades: workflow con ejecución y reversión.
- Elecciones: procesos, roles, candidatos, tokens, censo y escrutinio.

## Censo electoral (seguimiento de voto)

En la UI de censo (`/gobierno-escolar/censo`) se puede:

- Ver estado individual de votación por estudiante (`Votó` / `No votó`).
- Filtrar por estado de votación.
- Exportar XLSX con columna de votación.

Regla funcional implementada:

- Un estudiante cuenta como "votó" cuando completó todos los cargos obligatorios de la jornada.

## Comandos útiles

### Backend tests

```bash
cd backend
python manage.py test -v 1
```

### Frontend lint

```bash
cd kampus_frontend
npm run lint
```

### Frontend build

```bash
cd kampus_frontend
npm run build
```

## Documentación adicional

- [docs/compartir_data_dev.md](docs/compartir_data_dev.md)
- [docs/guia_deploy_vultr_docker.md](docs/guia_deploy_vultr_docker.md)
- [docs/runbook_verificacion_qr.md](docs/runbook_verificacion_qr.md)
- [docs/modo_actividades_notas.md](docs/modo_actividades_notas.md)
- [docs/plan_modo_actividades_notas.md](docs/plan_modo_actividades_notas.md)
- [docs/plan_modulo_novedades_estudiantes.md](docs/plan_modulo_novedades_estudiantes.md)
- [docs/formato_oficial_informe_ia.md](docs/formato_oficial_informe_ia.md)

## Troubleshooting rápido

- Si backend no conecta a DB en Docker, verificar `db` saludable y credenciales.
- Si frontend no llega al API, revisar `VITE_API_BASE_URL`.
- Si tareas async no procesan, revisar `backend_worker` y Redis.
- Si scheduler no ejecuta rutinas, revisar logs de `backend_scheduler`.

## Licencia

Proyecto bajo licencia MIT.

