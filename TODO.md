# TODO - Kampus

Prioridades: [P0] crítico/MVP, [P1] importante, [P2] siguiente iteración, [P3] mejora futura.

## Estado actual (completado)
- [x] [P0] Estructura de repos: `backend/` (Django/DRF) y `kampus_frontend/` (Vite React TS)
- [x] [P0] Configuración Django: `REST_FRAMEWORK` + JWT (SimpleJWT), CORS, `AUTH_USER_MODEL=users.User`
- [x] [P0] Modelo `users.User` extendido con `role` y migraciones aplicadas
- [x] [P0] PWA básico en frontend: `manifest.json`, `service-worker.js`, registro en `main.tsx`
- [x] [P0] `.gitignore` y primer commit
- [x] [P0] Remoto `origin` configurado y `main` publicada en GitHub
- [x] [P0] Archivos de entorno de ejemplo: `env.backend.example` y `env.frontend.example`
- [x] [P0] API de usuarios: CRUD con permisos (ADMIN/SUPERADMIN) y endpoint `GET /api/users/me/`
- [x] [P0] `README.md` actualizado con instrucciones de setup

## Infraestructura y repositorio
- [x] [P0] Configurar remoto y publicar `main` en GitHub
- [x] [P0] Crear archivos de entorno de ejemplo para backend y frontend (SECRET_KEY, DB, CORS, JWT, FCM)
- [x] [P0] Puerto dev 8000 verificado y activo
- [P1] Pre-commit hooks: black, isort, flake8 (backend) y ESLint/Prettier (frontend)
- [P1] Docker Compose (dev): Postgres, backend, frontend, Redis (para Celery)
- [P1] CI/CD (GitHub Actions): lint + tests + build

## Backend (Django/DRF)
### Usuarios y Autenticación
- [x] [P0] Serializers y ViewSet de `users.User` con permisos (solo ADMIN/SUPERADMIN)
- [x] [P0] Endpoint `api/users/me/` para perfil propio
- [P1] Comando de gestión para crear SUPERADMIN inicial desde env
- [P1] Documentar endpoints en `docs/api_endpoints.md`

### SIS (Estudiantes)
- [x] [P0] Modelos: `Student`, `FamilyMember`, `Enrollment`
- [x] [P0] Serializers + ViewSets con permisos (SECRETARY/ADMIN editan)
- [x] [P1] Endpoints: `/api/students/`, `/api/students/<id>/family/`, `/api/enrollments/`
- [P2] Exportación preliminar a SIMAT (CSV/TXT) con pre-validación

### Académico
- [P0] Modelos base: `AcademicYear`, `Period`, `Area`, `Subject`, `Grade`, `Course`, `GradeSheet`
- [P1] Motor SIEE mínimo (cuantitativo): componentes y ponderaciones, validación 100%
- [P1] Endpoints de configuración académica (`/api/academic-config/*`)
- [P2] `GradeSheet` edición y carga CSV masiva
- [P2] Soporte cualitativo para Preescolar (dimensiones, descriptores)

### Comunicaciones
- [P2] Modelos: `Message`, `Announcement`, `FCMDevice`
- [P2] Endpoints: registro de token FCM, envío de notificación de prueba
- [P2] Integración con tareas automáticas (notas publicadas, ausencias)

### Convivencia
- [P2] Modelos: `Protocol`, `Incident`, `Action`, `Case`
- [P2] Registro de incidentes con evidencias y flujo de citación

### Reportes
- [P2] Generación de boletines PDF (plantillas, Celery, almacenamiento)
- [P2] Verificación por QR (endpoint público de validación)
- [P3] Exportación DANE C600

### Transversal
- [P0] Sistema de permisos DRF por `User.role` (RBAC por vista/acción)
- [P1] Auditoría (signals/middleware) para eventos críticos (logins, cambios de notas)
- [P1] Celery + Redis para tareas en background
- [P2] Almacenamiento S3/MinIO para medios y PDFs

## Frontend (React + TS + Tailwind)
- [x] [P0] Configurar Axios base con interceptores (JWT attach/refresh)
- [x] [P0] `useAuthStore` (Zustand)
- [x] [P0] Rutas protegidas (`ProtectedRoute`)
- [x] [P0] Página `Login` con flujo JWT completo
- [P1] Página `StudentList` (tabla básica) y `StudentProfile` con pestañas
- [P1] `AcademicConfigPanel` (CRUD simple) con formularios
- [P2] `GradeSheetTable` con TanStack Table (edición inline + validaciones)
- [P1] PWA: migrar a Workbox (precaching, runtime caching api/assets)
- [P2] Notificaciones push: FCM (solicitud permisos, obtención token, envío a backend)
- [P1] Componentes UI reutilizables (botones, formularios, tabs) y tema Tailwind

## Pruebas
- [P1] Backend: configurar `pytest-django` y tests para auth y CRUD estudiantes
- [P1] Frontend: Vitest + React Testing Library para flujo de login
- [P2] E2E con Cypress: login y listado de estudiantes

## Documentación
- [P0] Crear `docs/architecture.md`, `docs/api_endpoints.md`, `docs/setup_guide.md`
- [x] [P0] Actualizar `README.md` con instrucciones de ejecución (backend/frontend)
- [P2] Esquema OpenAPI (drf-spectacular o similar) y publicar en `/api/schema/`

## Seguridad
- [P2] Políticas de contraseña y validación
- [P3] 2FA para roles administrativos
- [P2] Restricción por IP (opcional) para admin

## Entorno y utilidades
- [P0] Scripts de desarrollo (`makefile` o `npm scripts`) para levantar stack
- [P1] Seed data mínima (roles/usuarios de prueba, estudiantes de muestra)

---

Siguientes entregables sugeridos (MVP):
1) Autenticación completa (backend + frontend) y CRUD básico de estudiantes
2) Configuración académica mínima y planilla numérica básica
3) PWA con cache assets y `StudentList` funcionando offline (lectura)