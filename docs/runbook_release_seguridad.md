# Runbook de Release Seguro (Prioridad Seguridad)

## Objetivo
Estandarizar una puerta de calidad de seguridad antes de publicar cambios en producción.

## Alcance
- Backend Django (hardening de settings + checks de despliegue)
- Frontend React (lint)
- Configuración de entorno y perfiles `dev/prod`

## Pre-checklist (obligatorio)
- [ ] Variables de producción definidas (`DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, etc.).
- [ ] `DJANGO_ENV=production` y `DJANGO_DEBUG=false` en despliegue.
- [ ] `KAMPUS_CREATE_SUPERUSER=false` (si se habilita, contraseña fuerte obligatoria).
- [ ] Cambios de seguridad revisados en PR.

## Pipeline de seguridad en CI
Workflow: `.github/workflows/security-release-gate.yml`

Este workflow ejecuta:
1. `python manage.py check --deploy` con variables tipo producción.
2. Tests críticos de autenticación/verificación pública:
   - `users.tests`
   - `users.tests_cookie_auth`
   - `students.tests.PublicCertificateVerificationNotificationTest`
3. SAST backend con `bandit` (alta severidad/confianza).
4. SCA dependencias backend con `pip-audit`.
5. SCA dependencias frontend con `npm audit --audit-level=high --omit=dev`.
6. `npm run lint` en frontend.

## Validación manual local (antes de merge)
### Backend
```bash
python backend/manage.py check --deploy
python backend/manage.py test users.tests users.tests_cookie_auth students.tests.PublicCertificateVerificationNotificationTest
python -m pip install bandit pip-audit
bandit -r backend -x backend/**/migrations,backend/**/tests -ll -ii
pip-audit -r backend/requirements.txt --progress-spinner off
```

### Frontend
```bash
cd kampus_frontend
npm audit --audit-level=high --omit=dev
npm run lint
```

## Perfil de despliegue por ambiente
- Desarrollo: `docker-compose.yml`
- Producción: `docker-compose.yml` + `docker-compose.prod.yml`

Comando sugerido para producción:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

Validar que el resultado efectivo contenga:
- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECURE_SSL_REDIRECT=true`
- `DJANGO_SESSION_COOKIE_SECURE=true`
- `DJANGO_CSRF_COOKIE_SECURE=true`
- `KAMPUS_CREATE_SUPERUSER=false`

## Criterio de salida para release
- [ ] Workflow `Security Release Gate` en verde.
- [ ] Sin hallazgos críticos abiertos de auditoría en alcance del release.
- [ ] Sin hallazgos High/Critical abiertos en SCA/SAST o con excepción documentada.
- [ ] Evidencia de validación adjunta al PR (logs o capturas del check).

## Registro de auditoría recomendado
- Fecha/hora de ejecución del gate.
- Commit SHA validado.
- Resultado de `check --deploy`.
- Resultado de tests/lint.
- Responsable de aprobación.

## Gestión de excepciones de vulnerabilidades
Si aparece un hallazgo `High/Critical` no remediable en el release actual, aplicar la política:

- `docs/politica_excepciones_vulnerabilidades.md`
