# Informe de Auditoría Técnica (Seguridad + Bugs)

**Proyecto:** Kampus (Django REST + React/Vite)  
**Fecha:** 2026-02-23  
**Auditoría:** Revisión estática de código + checks automáticos (`manage.py check --deploy`)  
**Alcance:** `backend/`, `kampus_frontend/`, `docker-compose.yml`, archivos de entorno y configuración.

---

## 1) Resumen ejecutivo

Se identificaron riesgos relevantes de seguridad en configuración por defecto, credenciales iniciales y creación de contraseñas predecibles. También se detectaron bugs/riesgos funcionales que pueden impactar operación y experiencia de usuario.

**Estado general:** Riesgo **MEDIO-ALTO** si se despliega sin hardening adicional.  
**Prioridad inmediata:** endurecer configuración de producción, eliminar credenciales por defecto y corregir políticas de creación de usuarios.

---

## 2) Metodología aplicada

1. Revisión de configuración global de Django, JWT, CORS/CSRF y rutas públicas.
2. Revisión de autenticación backend + cliente frontend (Axios/cookies/refresh).
3. Búsqueda de patrones de riesgo (endpoints públicos, credenciales débiles, defaults inseguros).
4. Verificación automática con:
   - `python manage.py check`
   - `python manage.py check --deploy`

---

## 3) Hallazgos de seguridad

## S-01. Hardening incompleto para despliegue HTTPS (ALTO)
**Evidencia:** `python manage.py check --deploy` reporta `security.W004`, `W008`, `W012`, `W016`, `W018`.

**Detalle:** Falta configuración estricta de seguridad (`HSTS`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`) y se detecta `DEBUG=True` en contexto de despliegue.

**Impacto:** Aumenta riesgo de secuestro de sesión, downgrades a HTTP y exposición de información sensible.

**Ubicación principal:** `backend/kampus_backend/settings.py`.

**Recomendación:**
- Forzar `DEBUG=false` en producción.
- Configurar: `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD` (si aplica).
- Activar también headers seguros (`SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS`, `REFERRER_POLICY`).

---

## S-02. `SECRET_KEY` insegura por defecto + defaults permisivos (ALTO)
**Evidencia:**
- `backend/kampus_backend/settings.py`: fallback `django-insecure-...`.
- `docker-compose.yml`: `DJANGO_SECRET_KEY=django-insecure-docker-dev-key`.

**Impacto:** Debilita firma criptográfica de sesiones/tokens y aumenta superficie ante ataques de falsificación.

**Recomendación:**
- Exigir `DJANGO_SECRET_KEY` robusta desde entorno (sin fallback en producción).
- Separar claramente perfil `dev` y `prod` para evitar arrastre de defaults inseguros.

---

## S-03. Credenciales administrativas por defecto en bootstrap (ALTO)
**Evidencia:** `backend/entrypoint.sh` crea superusuario `admin/admin123` cuando `KAMPUS_CREATE_SUPERUSER=true` (valor por defecto actual).

**Impacto:** Riesgo crítico si el contenedor llega a entornos expuestos con credenciales no rotadas.

**Recomendación:**
- Cambiar default a `KAMPUS_CREATE_SUPERUSER=false`.
- Si se habilita, requerir contraseña vía variable obligatoria y compleja.
- Registrar alerta de arranque cuando se detecten credenciales débiles.

---

## S-04. Contraseñas predecibles en creación de estudiantes/docentes (ALTO)
**Evidencia:**
- `backend/students/serializers.py`: `password=username`.
- `backend/teachers/serializers.py`: `password=username`.
- `backend/students/views.py` (importación CSV): `password=document_number`.

**Impacto:** Compromiso de cuentas por adivinación/credential stuffing con datos fácilmente inferibles.

**Recomendación:**
- Generar contraseña temporal aleatoria fuerte + flujo obligatorio de cambio al primer login.
- Bloqueo/limitación por intentos y monitoreo de autenticación fallida.
- Política de contraseña robusta y comunicación segura de credenciales iniciales.

---

## S-05. Superficie de ataques de fuerza bruta en login/refresh (MEDIO-ALTO)
**Evidencia:** `backend/kampus_backend/auth_views.py` (`/api/auth/login/`, `/api/auth/refresh/`) no declara throttling específico.

**Impacto:** Mayor probabilidad de ataques automatizados a credenciales y tokens.

**Recomendación:**
- Definir throttles DRF por IP/usuario para autenticación.
- Considerar protección adicional (captcha progresivo, bloqueo temporal, detección de anomalías).

---

## S-06. Exposición de datos personales en endpoints públicos de verificación (MEDIO)
**Evidencia:** `backend/students/views.py` (`PublicCertificateVerifyView`) retorna datos como nombre y número de documento para certificados válidos.

**Impacto:** Riesgo de privacidad (PII) si URLs/UUID se comparten o se filtran.

**Recomendación:**
- Minimizar payload público (enmascarar documento, reducir campos).
- Definir política de privacidad explícita y retención mínima.
- Evaluar tokens/identificadores con menor capacidad de enumeración.

---

## S-07. Configuración abierta en desarrollo con potencial de fuga a producción (MEDIO)
**Evidencia:**
- `DJANGO_DEBUG` default `true`.
- `ALLOWED_HOSTS` con `*` cuando no se define variable y `DEBUG` activo.
- `CORS_ALLOW_ALL_ORIGINS=True` en debug sin lista explícita.

**Impacto:** Si se despliega con variables mal configuradas, se expone la aplicación innecesariamente.

**Recomendación:**
- Fail-fast al iniciar en modo producción sin variables críticas.
- Perfil de settings separado (`settings/dev.py`, `settings/prod.py`) o flags estrictos.

---

## 4) Otros bugs / riesgos no estrictamente de seguridad

## B-01. Importación CSV de estudiantes carga archivo completo en memoria (MEDIO)
**Evidencia:** `backend/students/views.py` usa `file_obj.read().decode('utf-8')`.

**Impacto:** Degradación de rendimiento y potencial de fallos con archivos grandes.

**Sugerencia:** procesar por streaming/chunks, validar tamaño y codificación.

---

## B-02. Señalización y defaults de entorno mezclan “dev” y “prod” (MEDIO)
**Evidencia:** `docker-compose.yml` y `entrypoint.sh` incluyen defaults de desarrollo agresivos.

**Impacto:** Errores operativos frecuentes en despliegues reales (misconfiguración accidental).

**Sugerencia:** separar plantillas de despliegue por ambiente y agregar validaciones de arranque.

---

## B-03. Flujo de alta masiva crea usuarios con credenciales débiles y sin onboarding (MEDIO)
**Evidencia:** `backend/students/views.py` en importación CSV.

**Impacto en usuario final:** cuentas comprometibles + mala experiencia al no tener proceso claro de activación/primer acceso.

**Sugerencia:** alta masiva con invitación, contraseña temporal aleatoria y cambio obligatorio.

---

## 5) Matriz DOFA

| **Fortalezas** | **Oportunidades** |
|---|---|
| Uso de DRF + JWT con soporte de cookies HttpOnly y CSRF en cliente. | Implementar hardening de producción y seguridad por capas (headers, throttling, observabilidad). |
| Existencia de throttling en endpoints públicos de verificación/votación. | Migrar a flujo de credenciales iniciales seguras y onboarding guiado para reducir soporte técnico. |
| Arquitectura modular por apps (users, students, elections, etc.). | Estandarizar perfiles `dev/prod` para despliegues seguros y repetibles. |
| Auditoría/eventos presentes en varios flujos públicos. | Introducir SAST/SCA y checklist de release como puerta de calidad. |

| **Debilidades** | **Amenazas** |
|---|---|
| Defaults inseguros (`DEBUG`, `SECRET_KEY`, superusuario por defecto). | Ataques de fuerza bruta / credential stuffing sobre login y usuarios con claves predecibles. |
| Contraseñas iniciales predecibles (username/documento). | Exposición de PII por enlaces públicos compartidos o filtrados. |
| Falta de throttling dedicado en endpoints de autenticación. | Error humano en despliegues al mezclar configuración de desarrollo con producción. |
| Señales de hardening incompleto (`check --deploy` con warnings). | Incidentes de reputación/compliance por brechas de privacidad y seguridad. |

---

## 6) Recomendaciones priorizadas (enfocadas en usuario final)

## Prioridad 0 (inmediato, 24-48h)
1. Corregir configuración de producción (`DEBUG=false`, HTTPS estricto, cookies seguras, headers).
2. Eliminar credenciales por defecto y forzar secretos robustos por entorno.
3. Bloquear creación de usuarios con contraseña predecible.

## Prioridad 1 (1-2 semanas)
1. Añadir throttling específico para `/api/auth/login/` y `/api/auth/refresh/`.
2. Rediseñar onboarding de cuentas: contraseña temporal aleatoria + cambio obligatorio + aviso claro al usuario.
3. Minimizar PII en endpoints públicos (documento enmascarado, principio de mínimo dato).

## Prioridad 2 (2-4 semanas)
1. Separar configuración por ambiente y validación “fail-fast” al arranque.
2. Agregar pipeline de seguridad: `manage.py check --deploy`, lint, SAST/SCA en CI.
3. Crear runbook de incidentes de autenticación y privacidad.

---

## 7) Impacto esperado en experiencia de usuario final

- **Mayor confianza**: menos riesgo de acceso no autorizado a cuentas y datos.
- **Menos fricción operativa**: onboarding de contraseñas más claro y seguro.
- **Mayor estabilidad**: menos errores por configuración en despliegues.
- **Mejor percepción institucional**: manejo responsable de datos personales.

---

## 8) Notas de alcance

- Esta auditoría es **estática** y de configuración/código; no incluyó pentesting dinámico externo.
- Para completar madurez de seguridad se recomienda una fase 2 con pruebas de caja negra y revisión de dependencias (SCA) en CI.
