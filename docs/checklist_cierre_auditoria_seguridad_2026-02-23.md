# Checklist de Cierre — Auditoría Seguridad/Bugs (2026-02-23)

## Objetivo
Registrar el estado de remediación de los hallazgos críticos/prioritarios del informe de auditoría y su evidencia técnica.

## Estado por hallazgo

| Hallazgo | Severidad | Estado | Evidencia principal |
|---|---|---|---|
| S-01 Hardening HTTPS/cookies/headers | ALTO | ✅ Cerrado | `backend/kampus_backend/settings.py`, `manage.py check --deploy` |
| S-02 SECRET_KEY y defaults inseguros | ALTO | ✅ Cerrado | `backend/kampus_backend/settings.py`, `docker-compose.yml`, `env.backend.example` |
| S-03 Credenciales admin por defecto | ALTO | ✅ Cerrado | `backend/entrypoint.sh`, `docker-compose.yml` |
| S-04 Contraseñas predecibles (student/teacher/import) | ALTO | ✅ Cerrado | `backend/students/serializers.py`, `backend/teachers/serializers.py`, `backend/students/views.py` |
| S-05 Falta throttling login/refresh | MEDIO-ALTO | ✅ Cerrado | `backend/kampus_backend/throttles.py`, `backend/kampus_backend/auth_views.py` |
| S-06 PII en verificación pública | MEDIO | ✅ Cerrado | `backend/students/views.py`, `backend/students/tests.py` |
| S-07 Riesgo de fuga dev→prod | MEDIO | ✅ Cerrado | `backend/entrypoint.sh`, `docker-compose.prod.yml` |
| B-02 Mezcla de señales dev/prod | MEDIO | ✅ Cerrado | `docker-compose.prod.yml`, `docs/runbook_release_seguridad.md` |
| B-03 Onboarding inseguro en alta masiva | MEDIO | ✅ Cerrado | `must_change_password` + contraseñas temporales |
| B-01 CSV completo en memoria | MEDIO | ✅ Cerrado | `backend/students/views.py` (streaming UTF-8 + límite de tamaño) |

## Evidencias de implementación (archivos)

- Hardening/settings: `backend/kampus_backend/settings.py`
- Fail-fast arranque: `backend/entrypoint.sh`
- Auth throttling: `backend/kampus_backend/throttles.py`, `backend/kampus_backend/auth_views.py`
- Password onboarding seguro:
  - `backend/users/models.py`
  - `backend/users/migrations/0008_user_must_change_password.py`
  - `backend/users/security.py`
  - `backend/kampus_backend/authentication.py`
  - `backend/students/serializers.py`
  - `backend/teachers/serializers.py`
  - `backend/students/views.py`
- Minimización PII pública:
  - `backend/students/views.py`
  - `kampus_frontend/src/pages/PublicCertificateVerify.tsx`
- Gate release y runbook:
  - `.github/workflows/security-release-gate.yml`
  - `docker-compose.prod.yml`
  - `docs/runbook_release_seguridad.md`
  - SAST/SCA activos: `bandit`, `pip-audit`, `npm audit`
- Importaciones CSV robustas (B-01):
  - `backend/students/views.py`
  - `backend/students/tests.py` (`StudentBulkImportFileValidationAPITest`)
  - `env.backend.example` (`KAMPUS_STUDENTS_IMPORT_MAX_MB`)

## Evidencias de validación (comandos)

### Backend seguridad
```bash
python backend/manage.py check --deploy
python backend/manage.py test users.tests users.tests_cookie_auth students.tests.PublicCertificateVerificationNotificationTest
python backend/manage.py test students.tests.StudentBulkImportFileValidationAPITest
```

### Frontend calidad
```bash
cd kampus_frontend
npm run lint
```

### Configuración efectiva prod
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

## Criterio de cierre de fase

- [x] Hallazgos críticos/prioritarios (S-01..S-07 + B-02/B-03) implementados.
- [x] Pruebas focalizadas de autenticación/verificación pública en verde.
- [x] Gate CI de release de seguridad agregado.
- [x] Runbook de release seguro publicado.
- [x] Hallazgos no críticos de rendimiento (B-01) cerrados.
- [x] SCA/SAST incorporados al gate CI.

## Próximo sprint recomendado

1. Runbook de incidentes de autenticación/privacidad (operación + respuesta).
2. Monitoreo de intentos bloqueados por throttling y cambio obligatorio de contraseña.
3. Operar excepciones con `docs/politica_excepciones_vulnerabilidades.md` y control de vencimientos.
