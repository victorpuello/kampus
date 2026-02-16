# Kampus Frontend

Frontend SPA de Kampus construido con React, TypeScript y Vite.

## Stack

- React 19 + React Router 7
- TypeScript
- Vite
- Tailwind CSS
- Axios (cliente API)
- Zustand (estado global)

## Requisitos

- Node.js 20+
- npm

Nota: para evitar advertencias de Vite en este proyecto, usa Node.js 20.19+ o 22.12+.

## Configuración de entorno

1. Copia variables de entorno:

```bash
cp ../env.frontend.example .env
```

2. Variables principales:

- `VITE_API_BASE_URL` (por defecto: `http://localhost:8000`)
- `VITE_APP_NAME`
- `SITE_URL` (usada en build para SEO: sitemap/robots)

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run lint     # lint con eslint
npm run build    # build producción + generación de archivos SEO
npm run preview  # servir build local
```

## Desarrollo local

Desde la raíz del repositorio:

```bash
cd kampus_frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Integración con backend

- El frontend consume la API Django/DRF en `VITE_API_BASE_URL`.
- Autenticación JWT con refresh automático y logout por evento cuando el refresh falla.
- Cliente API principal: `src/services/api.ts`.

## Comisiones (disciplina) - estado actual

- La pestaña de Disciplina en Comisiones muestra registros unificados de:
  - anotaciones del observador (`ObserverAnnotation`)
  - casos formales de convivencia (`DisciplineCase`)
- La UI muestra etiqueta de origen por estudiante (`Caso` / `Anotación`).
- En estado de carga, el número de skeleton rows coincide exactamente con el `page_size` seleccionado en la pestaña.

## Estructura relevante

- `src/pages/CommissionsWorkflow.tsx`: flujo de comisiones y pestaña disciplina.
- `src/services/academic.ts`: tipos y llamadas API académicas.
- `src/services/api.ts`: cliente Axios base e interceptores de auth.
