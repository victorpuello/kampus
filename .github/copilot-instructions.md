## Copilot instructions (Kampus)

### Big picture
- Monorepo: Django REST API in `backend/`, React + TypeScript + Vite SPA in `kampus_frontend/`.
- Backend is split into Django apps per domain (`backend/academic/`, `backend/discipline/`, `backend/students/`, `backend/users/`, etc.).
- Auth is DRF + SimpleJWT; tokens are issued at `POST /api/token/` and refreshed at `POST /api/token/refresh/` (see `backend/kampus_backend/urls.py`).

### Local dev (most reliable)
- Full stack: `docker-compose up --build` (services: Postgres `:5432`, backend `:8000`, frontend `:5173`, plus `backend_scheduler`).
- Backend container bootstraps automatically via `backend/entrypoint.sh`:
  - Runs migrations when `KAMPUS_RUN_MIGRATIONS=true`.
  - Creates a dev superuser when `KAMPUS_CREATE_SUPERUSER=true` (defaults to `admin` / `admin123`).
- Manual backend: install `backend/requirements.txt` then run `python backend/manage.py migrate` and `python backend/manage.py runserver`.
- Frontend: `cd kampus_frontend && npm install && npm run dev` (Vite uses polling; see `kampus_frontend/vite.config.ts`).

### Configuration conventions
- DB: if `POSTGRES_DB` is set, Django uses Postgres; otherwise it falls back to SQLite (see `backend/kampus_backend/settings.py`).
- Timezone/locale: `America/Bogota`, `es-co` (same file).
- Secrets/config come from env vars (`env.backend.example`, `env.frontend.example`); never hardcode keys (e.g. `GOOGLE_API_KEY`).

### Backend patterns
- URLs commonly use DRF routers (`DefaultRouter`) and are mounted under `/api/` (e.g. `backend/users/urls.py`, `backend/students/urls.py`, `backend/teachers/urls.py`).
- Permissions:
  - Role-based permissions live in `backend/users/permissions.py` (e.g. `IsAdmin`, `IsCoordinator`).
  - Django model-permission RBAC helpers live in `backend/core/permissions.py` (`KampusModelPermissions`, `HasDjangoPermission`).
- Scheduled jobs: `docker-compose.yml` runs `python manage.py notify_descargos_deadlines` periodically (implementation in `backend/discipline/management/commands/notify_descargos_deadlines.py`).

### Frontend patterns
- API client is Axios in `kampus_frontend/src/services/api.ts`:
  - Stores tokens in `localStorage` (`accessToken`, `refreshToken`).
  - Auto-refreshes on 401 and emits `kampus:auth:logout` when refresh is invalid.
  - Base URL is `import.meta.env.VITE_API_BASE_URL`.
- Table UI: follow the established Tailwind table style in `kampus_frontend/src/pages/TeacherList.tsx` and `kampus_frontend/src/pages/UserList.tsx` (same thead/tbody/row classes).

### Tests / checks
- Backend: `python backend/manage.py test`.
- Frontend: `cd kampus_frontend && npm run lint`.
