# Kampus

Plataforma de gestión escolar (Colombia) — Backend: Django/DRF, Frontend: React/Tailwind, DB: PostgreSQL, PWA.

## Estructura

- `backend/`: proyecto Django (`kampus_backend`) y apps (`users`, `students`, `academic`, ...)
- `kampus_frontend/`: Vite + React + TypeScript + Tailwind + PWA básico

## Entorno

1) Backend
- Copiar `.env.backend.example` a `.env` en la raíz del repo o exportar variables en el entorno.
- Instalar dependencias:
  - `python3 -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt` (pendiente) o `pip install Django djangorestframework django-cors-headers djangorestframework-simplejwt psycopg2-binary`
- Migraciones: `cd backend && python manage.py migrate`
- Ejecutar: `python manage.py runserver`

2) Frontend
- `cd kampus_frontend && npm install`
- Ejecutar: `npm run dev` (por defecto en `http://localhost:5173`)

## Variables de entorno (backend)

Ver archivo `env.backend.example` para valores de ejemplo (SECRET_KEY, DB, CORS, etc.).

## Tareas

Consultar `TODO.md` para el plan priorizado.
