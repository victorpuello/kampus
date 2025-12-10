## Kopilot / AI Agent Instructions for Kampus

This file gives concise, actionable guidance for AI coding agents working in this repository so they can be immediately productive.

- Project overview: Backend is Django (REST API) in `backend/`; frontend is React + TypeScript + Vite in `kampus_frontend/`.
- Datastore: Production expects PostgreSQL (configured via env vars) with a SQLite fallback for local dev. See `backend/kampus_backend/settings.py`.
- Auth: Django REST Framework + SimpleJWT. Default permission class is `IsAuthenticated` in settings.

Quick developer workflows (commands you can run locally):

- Full stack (recommended for development): `docker-compose up --build` (see `docker-compose.yml`). Services exposed: backend `:8000`, frontend `:5173`, db `:5432`.
- Backend (manual):
  - Create venv: `python3 -m venv .venv && source .venv/bin/activate`
  - Install: `pip install -r backend/requirements.txt`
  - Copy env example: `cp env.backend.example .env` and edit as required
  - Run migrations: `python backend/manage.py migrate`
  - Create superuser: `python backend/manage.py createsuperuser`
  - Run dev server: `python backend/manage.py runserver`
- Frontend:
  - `cd kampus_frontend && npm install`
  - Dev server: `npm run dev` (Vite serves at `http://localhost:5173` by default)
  - Use `VITE_API_BASE_URL` to point to the backend (see `env.frontend.example`).

Key repository conventions & patterns (do not invent alternatives):

- Apps: Each feature is a Django app under `backend/` (e.g. `academic`, `students`, `users`, `reports`). Follow existing app structure when adding new features.
- Custom user model: `AUTH_USER_MODEL = "users.User"` — updates affecting auth must target `users.models` and migrations.
- Settings & environment:
  - DB is configured via `POSTGRES_*` env vars; absence falls back to SQLite. Respect this when writing local dev helpers.
  - `GOOGLE_API_KEY` is used for generative AI features (see `backend/kampus_backend/settings.py`). Do not hardcode keys.
- CORS: `corsheaders.middleware.CorsMiddleware` is intentionally placed near the top of `MIDDLEWARE`.
- REST: DRF is used; default permission class is `IsAuthenticated`. Public endpoints will explicitly set permissions in views/serializers.

Frontend UI Standards:

- Data Tables: Use the standard style found in `TeacherList.tsx` and `UserList.tsx`.
  - Container: `overflow-x-auto` inside a Card or bordered div.
  - Table: `<table className="w-full text-sm text-left">`
  - Header: `<thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">`
  - Header Cells: `<th className="px-6 py-4 font-semibold">`
  - Body: `<tbody className="divide-y divide-slate-100">`
  - Rows: `<tr className="bg-white hover:bg-slate-50/80 transition-colors">`
  - Cells: `<td className="px-6 py-4">`
  - Badges: Use `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ...`

Integration points and important files to reference:

- `backend/kampus_backend/settings.py` — DB, JWT, CORS, global settings, timezone (`America/Bogota`) and language (`es-co`).
- `docker-compose.yml` — quick way to run Postgres + backend + frontend for development.
- `env.backend.example`, `env.frontend.example` — canonical env keys; copy these when running locally.
- `kampus_frontend/src/services` — frontend API wrappers; mirror backend endpoint shapes when updating client code.
- `reports/` and `test_weasyprint.py` — examples of PDF/report generation patterns.

Testing & linting notes:

- Backend tests: use Django test runner: `python backend/manage.py test` (tests live under each app `tests.py` or `tests/`).
- Frontend linting: `kampus_frontend/` contains `eslint.config.js` — run `npm run lint` if available or `npx eslint`.

When changing migrations or the DB schema:

- Always add migrations under the relevant app (`backend/<app>/migrations/`) and run `python backend/manage.py makemigrations` locally.
- For schema-breaking changes coordinate with the team; `docker-compose` uses Postgres and persistent volume `postgres_data` in `docker-compose.yml`.

Security-sensitive guidance:

- Do not commit real secrets. Use the `env.*.example` files as canonical lists of keys.
- `GOOGLE_API_KEY` and any DB credentials must come from environment variables or secret management.

Examples of concrete file references (use these to discover patterns):

- SIEE / academic logic: `backend/academic/`
- Custom permissions: `backend/users/permissions.py` and `backend/core/permissions.py`
- Serializers: `backend/*/serializers.py` (follow existing style and naming)

Repository notes for AI agents:

- No existing `.github/copilot-instructions.md` or `AGENT.md` was found; use this file as the primary instruction set.
- Keep guidance concrete and grounded in the files referenced above; prefer small, focused patches over broad rewrites.

If anything is unclear or you need additional examples (e.g., how API contracts map to the frontend service layer), ask for the specific area you want expanded and I will add short targeted snippets.
