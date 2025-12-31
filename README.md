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

### Opción manual: Backend

```bash
# Clonar el repositorio
git clone https://github.com/victorpuello/kampus.git
cd kampus

# Crear y activar entorno virtual
python3 -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate

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

## 📂 Estructura del Proyecto

```
kampus/
├── backend/                 # Código fuente del Backend (Django)
│   ├── academic/            # App: Gestión académica y SIEE
│   ├── audit/               # App: Auditoría de accesos/acciones sensibles
│   ├── communications/      # App: Mensajería y notificaciones
│   ├── core/                # App: Modelos base e institución
│   ├── discipline/          # App: Convivencia / Observador disciplinario
│   ├── students/            # App: Gestión de estudiantes
│   ├── users/               # App: Autenticación y usuarios
│   └── manage.py            # CLI de Django
├── kampus_frontend/         # Código fuente del Frontend (React)
│   ├── src/
│   │   ├── components/      # Componentes reutilizables UI
│   │   ├── pages/           # Vistas principales
│   │   ├── services/        # Integración con API
│   │   └── store/           # Gestión de estado global
│   └── vite.config.ts       # Configuración de Vite
└── docs/                    # Documentación adicional
```

---

## 🔄 Actualizaciones Recientes (Diciembre 2025)

- **SIEE Mejorado**: Implementación completa de escalas de valoración cualitativas y numéricas.
- **Gestión de Datos**: Corrección de duplicidad en correos electrónicos de usuarios.
- **UX**: Nuevos filtros por año en paneles de configuración.
- **DevOps**: Scripts de limpieza y corrección de migraciones.
- **Convivencia / Observador**: auditoría, sellado/inmutabilidad, y portal de acudientes (rol PARENT) con enterado autenticado.
- **Reportes**: nuevo PDF de **boletines/informe académico por periodo**, descargable por **grupo completo** (multipágina) o por **estudiante**.

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

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

---

Desarrollado con ❤️ por Víctor Puello, para la educación en Colombia.

