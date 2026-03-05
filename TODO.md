# TODO - Kampus

Prioridades: [P0] crítico/MVP, [P1] importante, [P2] siguiente iteración, [P3] mejora futura.

## 🐛 BUGS A CORREGIR

## Sprint Actual - Recordatorios de Planeacion Docente
- ✅ Command `notify_pending_planning_teachers` implementado con reglas `0%` y `<100%` para periodo actual.
- ✅ Mensajes incluyen fecha de cierre (`planning_edit_until` o fin de `end_date`) y CTA a `/planning`.
- ✅ Canales activos via `notify_users`: in-app + correo.
- ✅ Deduplicación diaria por docente/periodo/categoría.
- ✅ Task Celery `teachers.notify_pending_planning_teachers` creada.
- ✅ Schedule Beat configurado en `settings.py` por env vars `KAMPUS_PLANNING_REMINDER_*`.
- ✅ Variables documentadas en `env.backend.example`.
- ✅ Tests backend del feature (`teachers.test_planning_reminders`) pasando.
- ✅ `docker-compose.prod.yml` activado por defecto con `KAMPUS_PLANNING_REMINDER_BEAT_ENABLED=true`.
- ✅ Guia operativa creada: `docs/guia_despliegue_recordatorios_planeacion.md`.
- [ ] Desplegar cambios en producción y reiniciar `backend_beat` + `backend_worker`.
- [ ] Verificar primera ejecución programada en logs y muestreo de `Notification`/`EmailDelivery`.
- [ ] Monitorear 24h con `check_notifications_health` para confirmar impacto de tasa de éxito.

### [P1] Autenticación en generación de reportes (9 dic 2025)
**Estado:** Investigado, fallo de autenticación en frontend
**Síntomas:**
- GET `/api/enrollments/report/` retorna 404 desde el navegador
- El mismo endpoint funciona correctamente con `curl` usando JWT válido
- Endpoint existe y está correctamente configurado en el backend

**Análisis:**
- ✅ El endpoint `/api/enrollments/report/` está registrado en el router
- ✅ El método `report()` en `EnrollmentViewSet` está correctamente implementado
- ✅ Con JWT válido vía `curl`, retorna 200 OK con datos CSV/PDF
- ❌ Frontend obtiene 404 aunque axios está configurado con interceptor de token

**Causa probable:**
- El token JWT en localStorage está expirado o no está siendo enviado
- El interceptor de refresh token en `api.ts` puede no estar funcionando correctamente
- El navegador puede estar obteniendo error 401 que Django no reporta claramente

**Solución pendiente:**
1. Verificar que la sesión esté activa al usar el reporte
2. Revisar los logs de refresh token en el navegador
3. Considerar mecanismo de refresh automático más robusto
4. Agregar manejo de errores más detallado en el frontend

**Archivos afectados:**
- `kampus_frontend/src/services/api.ts` (interceptor de token)
- `kampus_frontend/src/store/auth.ts` (gestión de tokens)
- `kampus_frontend/src/pages/enrollments/EnrollmentReports.tsx` (componente de reportes)
- `backend/students/urls.py` (configuración de rutas - ya corregida)
- `backend/students/views.py` (endpoint implementado correctamente)

## Estado actual (completado)
- ✅ [P0] Estructura de repos: `backend/` (Django/DRF) y `kampus_frontend/` (Vite React TS)
- ✅ [P0] Configuración Django: `REST_FRAMEWORK` + JWT (SimpleJWT), CORS, `AUTH_USER_MODEL=users.User`
- ✅ [P0] Modelo `users.User` extendido con `role` y migraciones aplicadas
- ✅ [P0] PWA básico en frontend: `manifest.json`, `service-worker.js`, registro en `main.tsx`
- ✅ [P0] `.gitignore` y primer commit
- ✅ [P0] Remoto `origin` configurado y `main` publicada en GitHub
- ✅ [P0] Archivos de entorno de ejemplo: `env.backend.example` y `env.frontend.example`
- ✅ [P0] API de usuarios: CRUD con permisos (ADMIN/SUPERADMIN) y endpoint `GET /api/users/me/`
- ✅ [P0] `README.md` actualizado con instrucciones de setup

## Infraestructura y repositorio
- ✅ [P0] Configurar remoto y publicar `main` en GitHub
- ✅ [P0] Crear archivos de entorno de ejemplo para backend y frontend (SECRET_KEY, DB, CORS, JWT, FCM)
- ✅ [P0] Puerto dev 8000 verificado y activo
- [P1] Pre-commit hooks: black, isort, flake8 (backend) y ESLint/Prettier (frontend)
- [P1] Docker Compose (dev): Postgres, backend, frontend, Redis (para Celery)
- [P1] CI/CD (GitHub Actions): lint + tests + build

## Backend (Django/DRF)
### Usuarios y Autenticación
- ✅ [P0] Serializers y ViewSet de `users.User` con permisos (solo ADMIN/SUPERADMIN)
- ✅ [P0] Endpoint `api/users/me/` para perfil propio
- ✅ [P0] Tests unitarios (pytest) para módulo de usuarios
- [P1] Comando de gestión para crear SUPERADMIN inicial desde env
- [P1] Documentar endpoints en `docs/api_endpoints.md`

### SIS (Estudiantes)
- ✅ [P0] Modelos: `Student`, `FamilyMember`, `Enrollment`
- ✅ [P0] Serializers + ViewSets con permisos (SECRETARY/ADMIN editan)
- ✅ [P1] Endpoints: `/api/students/`, `/api/students/<id>/family/`, `/api/enrollments/`
- [P2] Exportación preliminar a SIMAT (CSV/TXT) con pre-validación

### Académico
- [P0] Modelos base: `AcademicYear`, `Period`, `Area`, `Subject`, `Grade`, `Course`, `GradeSheet`
- ✅ [P1] Módulo de Planeación: Banco de Logros y Planeación de Periodo con IA (Gemini)
- [P1] Motor SIEE mínimo (cuantitativo): componentes y ponderaciones, validación 100%
- [P1] Endpoints de configuración académica (`/api/academic-config/*`)
- [P2] `GradeSheet` edición y carga CSV masiva
- [P2] Soporte cualitativo para Preescolar (dimensiones, descriptores)

### SIEE / Promoción anual (registro año a año)
- ✅ [P0] Motor de decisión SIEE (PROMOTED/CONDITIONAL/REPEATED) + snapshots persistentes por matrícula
- ✅ [P0] Endpoints de cierre/análisis:
	- `GET /api/academic-years/{id}/promotion-preview/`
	- `POST /api/academic-years/{id}/close-with-promotion/`
	- `POST /api/academic-years/{id}/apply-promotions/`
- ✅ [P1] Importación manual de historial externo por estudiante:
	- `POST /api/students/{id}/import-academic-history/` (persiste en snapshot.details)

Pendientes para “cerrar circuito”:
- ✅ [P0] Seed/validación de `Grade.ordinal` (Jardín → 11) para que `apply-promotions` pueda calcular el “siguiente grado” sin saltar estudiantes
- ✅ [P0] Flujo PAP (condicional) completo:
	- ✅ endpoints UI/API para marcar cumplimiento/incumplimiento del PAP
	- ✅ regla de verificación en 1er periodo del año siguiente (confirmar promoción vs. retener)
- [P1] UI/Frontend para operación:
	- ✅ vista previa de promoción
	- ✅ cierre de año con promoción
	- ✅ aplicar promociones
	- ✅ importar historial externo
	- ✅ seguimiento PAP
- [P1] Política para estudiantes que ingresan tarde (`Enrollment.enrolled_at`): cómo promediar periodos faltantes y/o cómo tratar “sin nota”
- [P2] Nivelación semestral con tope (reemplazo máximo 3.0) y reglas de cuándo aplica
- [P2] PIAR/NEE: excepciones por estudiante (ajustes de regla SIEE)
- [P3] Sellado/firma de snapshots (si se requiere): calcular y validar hash/cadena de custodia

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
- ✅ [P0] Configurar Axios base con interceptores (JWT attach/refresh)
- ✅ [P0] `useAuthStore` (Zustand)
- ✅ [P0] Rutas protegidas (`ProtectedRoute`)
- ✅ [P0] Página `Login` con flujo JWT completo
- ✅ [P0] Módulo de Usuarios: Listado (`UserList`), Formulario (`UserForm`), Eliminación con Modal
- ✅ [P1] Componente `ConfirmationModal` reutilizable
- ✅ [P1] Página `PapPlans` (PAP): listado y resolución
- ✅ [P1] Página `PromotionWorkflow` (Promoción anual): previsualizar / cerrar / aplicar
- ✅ [P1] Página `StudentList` (tabla básica) y `StudentProfile` básico
- ✅ [P1] Página `TeacherList` (tabla básica)
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
- ✅ [P0] Actualizar `README.md` con instrucciones de ejecución (backend/frontend)
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