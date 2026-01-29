# 🎓 Kampus - Plataforma de Gestión Escolar

![Status](https://img.shields.io/badge/Status-En%20Desarrollo-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Python](https://img.shields.io/badge/Python-3.10%2B-yellow)
![Django](https://img.shields.io/badge/Django-5.0-092E20)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6)

**Kampus** es un sistema integral para la administración académica diseñado específicamente para instituciones educativas en **Colombia**. Su arquitectura moderna permite gestionar de manera eficiente procesos de matrícula, evaluación (SIEE), y organización institucional, cumpliendo con los lineamientos del Ministerio de Educación Nacional.

---

## ✨ Características Principales

### 🏫 Gestión Institucional
- Configuración de múltiples sedes.
- Gestión de años lectivos y periodos académicos.
- Organización de niveles (Preescolar, Básica, Media), grados y grupos.

### 📊 Sistema de Evaluación (SIEE)
- **Escalas Híbridas**: Soporte simultáneo para escalas **Numéricas** (1.0 - 5.0) y **Cualitativas** (Descriptores).
- **Flexibilidad**: Configuración personalizada por año lectivo.
- **Herramientas de Productividad**: Funcionalidad para copiar escalas entre años lectivos.

### 👥 Comunidad Educativa
- **Perfiles de Usuario**: Rectores, Coordinadores, Docentes, Estudiantes y Acudientes.
- **Hoja de Vida del Estudiante**: Información personal, familiar, médica y académica.
- **Gestión de Matrículas**: Proceso de inscripción y seguimiento.

### 🧾 Convivencia (Observador del Estudiante)
- Registro de casos disciplinarios (Ley 1620) con participantes, adjuntos y bitácora.
- Descargos, decisión y cierre con acta imprimible.
- Notificación trazable a acudiente + enterado/acuse autenticado.
- Blindaje probatorio: auditoría de accesos y **sellado/inmutabilidad** post-cierre (con hash SHA-256).

### 💻 Experiencia de Usuario
- Interfaz moderna y responsiva (Mobile-first).
- Panel de configuración centralizado.
- Navegación intuitiva y rápida (SPA).

### 📝 Calificaciones (Planilla)
- Planilla de notas con modo híbrido: **Tradicional** (nota por logro) y **Actividades** (subcolumnas por logro con promedio automático; vacíos=1.0).
- En modo **Actividades**: columnas por logro (agregar, renombrar inline, desactivar) + navegación tipo planilla con teclado.
- UX móvil: vista por tarjetas y **Captura rápida** para reducir scroll.
- Reportes: descarga de **informe académico del grupo** en PDF (según permisos/rol del usuario).
- Guías: `docs/modo_actividades_notas.md` y `docs/plan_modo_actividades_notas.md`.

### 🤖 Informe IA (Oficial)
- Formato oficial del **Informe IA (Estado del grupo)** en PDF: ver `docs/formato_oficial_informe_ia.md`.

---

## 🛠️ Stack Tecnológico

### Backend (API REST)
- **Framework**: Django 5 & Django REST Framework.
- **Autenticación**: JWT (JSON Web Tokens).
- **Base de Datos**: PostgreSQL (Producción) / SQLite (Desarrollo).
- **Documentación**: Swagger / Redoc.

### Frontend (SPA)
- **Core**: React 18 + TypeScript.
- **Build Tool**: Vite.
- **Estilos**: Tailwind CSS + Shadcn/ui components.
- **Iconos**: Lucide React.
- **Estado**: React Hooks & Context API.

---

## 🚀 Instalación y Configuración

### Prerrequisitos
- Python 3.10 o superior.
- Node.js 18 o superior.
- Git.

### Opción recomendada: correr todo con Docker (Full Stack)

```bash
docker-compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- Postgres: `localhost:5432`

> El stack incluye un servicio `backend_scheduler` para tareas automáticas (p. ej. alertas por vencimiento de descargos).

Notas para desarrollo local (Docker):
- Si defines `KAMPUS_RUN_MIGRATIONS=true`, el contenedor del backend ejecuta migraciones al iniciar.
- Si defines `KAMPUS_CREATE_SUPERUSER=true`, el contenedor crea un superusuario de desarrollo (por defecto `admin` / `admin123`).

### Opción manual: Backend

```bash
# Clonar el repositorio
git clone https://github.com/victorpuello/kampus.git
cd kampus

# Crear y activar entorno virtual
python3 -m venv .venv

# Linux/macOS
source .venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# Instalar dependencias
pip install -r backend/requirements.txt

# Configurar variables de entorno
cp env.backend.example .env
# (Editar .env con tus credenciales de base de datos si es necesario)

# Aplicar migraciones
python backend/manage.py migrate

# Crear superusuario
python backend/manage.py createsuperuser

# Iniciar servidor de desarrollo
python backend/manage.py runserver
```

### 2. Configuración del Frontend

```bash
# Navegar al directorio del frontend
cd kampus_frontend

# Instalar dependencias
npm install

# Variables de entorno (opcional)
cp ../env.frontend.example .env
# Ajusta VITE_API_BASE_URL si tu backend no está en localhost:8000

# Iniciar servidor de desarrollo
npm run dev
```

El frontend estará disponible en `http://localhost:5173` y el backend en `http://localhost:8000`.

---

## 🔎 Verificación pública por QR (deploy)

La verificación pública de certificados (QR) usa rutas sin autenticación que deben funcionar en producción con reverse proxy.

Recomendaciones:
- Asegura que el proxy enrute `/api/` al backend (Django).
- Define `KAMPUS_PUBLIC_SITE_URL` con el dominio público canónico (ej: `https://colegio.midominio.com`) para que los PDFs incrusten URLs correctas.
- Define `KAMPUS_PUBLIC_VERIFY_THROTTLE_RATE` para rate limit (ej: `60/min`).
- Si en producción `/public/` es servido por el frontend (SPA), el proyecto incluye rutas públicas para `'/public/certificates/:uuid'` (QR legacy).
- Si `/public/` es servido por el backend, Django también expone `path('public/', ...)`.

Runbook: ver [docs/runbook_verificacion_qr.md](docs/runbook_verificacion_qr.md).

## 🖼️ Miniaturas de fotos (deploy)

Kampus genera miniaturas WebP (256px) para fotos de estudiantes y docentes para mejorar el rendimiento (especialmente en listados).

Después de un deploy grande o una restauración de datos, puede ser útil ejecutar el backfill una sola vez.
Guía y comandos: ver `Mantenimiento y Actualización` en [docs/guia_deploy_vultr_docker.md](docs/guia_deploy_vultr_docker.md).

---

## 📂 Estructura del Proyecto

```
kampus/
├── docker-compose.yml               # Orquestación local (Postgres + backend + frontend + scheduler)
├── env.backend.example              # Variables de entorno de ejemplo (backend)
├── env.frontend.example             # Variables de entorno de ejemplo (frontend)
├── backend/                         # Backend (Django + DRF)
│   ├── manage.py                    # CLI de Django
│   ├── entrypoint.sh                # Bootstrap del contenedor (migraciones + superuser dev)
│   ├── requirements.txt             # Dependencias Python
│   ├── kampus_backend/              # Proyecto Django (settings/urls/wsgi/asgi)
│   ├── academic/                    # App: Gestión académica y SIEE
│   ├── attendance/                  # App: Asistencia
│   ├── audit/                       # App: Auditoría de accesos/acciones sensibles
│   ├── communications/              # App: Mensajería y notificaciones
│   ├── config/                      # App: Configuración institucional
│   ├── core/                        # App: Modelos base e institución
│   ├── discipline/                  # App: Convivencia / Observador
│   ├── novelties/                   # App: Novedades (workflow + adjuntos + ejecución/reversión)
│   ├── notifications/               # App: Notificaciones
│   ├── reports/                     # App: Jobs de reportes (PDF/descargas)
│   ├── students/                    # App: Estudiantes (matrículas, certificados, reportes)
│   ├── teachers/                    # App: Docentes
│   └── users/                       # App: Usuarios y permisos
├── kampus_frontend/                 # Frontend (React + TypeScript + Vite)
│   ├── src/
│   │   ├── components/              # Componentes reutilizables UI
│   │   ├── pages/                   # Vistas (rutas)
│   │   ├── services/                # Cliente API (Axios) y servicios
│   │   └── store/                   # Estado global (auth, etc.)
│   └── vite.config.ts               # Configuración Vite
└── docs/                            # Documentación adicional
```

---

## 🧩 Módulo de Novedades (Workflow)

El módulo de **Novedades** gestiona casos con trazabilidad completa (radicado, estados, bitácora, adjuntos), y permite **aprobar**, **ejecutar** y **revertir** cambios académicos de forma transaccional.

- **API**: `/api/novelties-workflow/`
- **Características**:
	- Radicado por institución/año.
	- Workflow por estados (borrador → radicada → revisión → aprobada/pendiente docs → ejecutada → revertida/cerrada).
	- Checklist de soportes por tipo/motivo (reglas de documentos requeridos).
	- Ejecución idempotente (por `idempotency_key`) y snapshots before/after.

**Graduación (UX sin fricción)**
- La **aprobación** de casos de graduación **no requiere comentario**.
- La **graduación** no se bloquea por soportes/adjuntos obligatorios.

Documento de diseño/plan: [docs/plan_modulo_novedades_estudiantes.md](docs/plan_modulo_novedades_estudiantes.md).

---

## 🔄 Actualizaciones Recientes (Enero 2026)

- **SIEE Mejorado**: Implementación completa de escalas de valoración cualitativas y numéricas.
- **Gestión de Datos**: Corrección de duplicidad en correos electrónicos de usuarios.
- **UX**: Nuevos filtros por año en paneles de configuración.
- **Certificados (Administración)**: edición y eliminación de emisiones; eliminación de certificados emitidos se maneja como revocatoria.
- **RBAC (móvil)**: búsqueda y agrupación de permisos con acordeón por grupo.
- **UI móvil**: mejoras de usabilidad en `/users`, `/rbac` y `/academic-config` (tabs más accesibles, formularios apilados, acciones táctiles).
- **DevOps**: Scripts de limpieza y corrección de migraciones.
- **Convivencia / Observador**: auditoría, sellado/inmutabilidad, y portal de acudientes (rol PARENT) con enterado autenticado.
- **Reportes**: nuevo PDF de **boletines/informe académico por periodo**, descargable por **grupo completo** (multipágina) o por **estudiante**.
- **Novedades (workflow)**: módulo nuevo para tramitar/aprobar/ejecutar/revertir novedades; graduación sin comentario obligatorio y sin bloqueo por soportes.

---

## ✅ Tests y notas de entorno

### Backend

Ejecuta los tests desde la carpeta `backend/` (Django discovery en este repo depende del cwd):

```bash
cd backend
python manage.py test -v 1
```

Nota (Windows): algunos tests de PDF con **WeasyPrint** pueden requerir dependencias nativas (GTK/Pango). Si no están disponibles, esos tests se omiten (skip). Para un entorno más estable, usa `docker-compose up --build`.

### Frontend

```bash
cd kampus_frontend
npm run lint
```

### 🔧 Configuración académica (UI)

- Ruta: `/academic-config`
- Incluye la configuración de SIEE y un tab de Convivencia (Manual) para administración.

### 🧾 Reportes: Boletines por periodo (PDF)

- **UI**: Menú **Reportes** → **Boletines por periodo** (`/enrollments/reports`).
- **Qué genera**:
	- **Grupo**: 1 PDF con 1 página por estudiante.
	- **Estudiante**: 1 PDF para una matrícula específica.
- **Requisitos**: seleccionar **Año**, **Grupo** y **Periodo**.
- **Permisos**:
	- En **Reportes** (módulo `/enrollments/reports`) está orientado a perfiles administrativos.
	- En **Calificaciones** (planilla), docentes pueden descargar el informe por grupo/estudiante según sus permisos asignados.

---

## 🤝 Compartir data para desarrollo

Ver la guía: [docs/compartir_data_dev.md](docs/compartir_data_dev.md)

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

---

Desarrollado con ❤️ por Víctor Puello, para la educación en Colombia.

