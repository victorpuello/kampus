# Reejecución de Auditoría Técnica (Seguridad + Bugs)

**Proyecto:** Kampus (Django REST + React/Vite)  
**Fecha de reejecución:** 2026-02-23  
**Alcance:** Backend, frontend, configuración y pruebas focalizadas de seguridad/autenticación.

---

## 1) Resumen ejecutivo

Se reejecutó la auditoría y el estado de seguridad **mejoró de forma significativa** frente al informe previo.

- Se confirmaron remediaciones en credenciales por defecto, hardening por ambiente, throttling de autenticación y generación de contraseñas iniciales.
- Persisten riesgos operativos de configuración cuando se ejecuta en modo desarrollo (warnings esperables de `check --deploy`).
- Estado actual estimado: **RIESGO MEDIO** (antes: medio-alto).

---

## 2) Evidencia de validación ejecutada

### Checks y pruebas
- `python manage.py check` → sin issues.
- `python manage.py check --deploy` → 6 warnings cuando se evalúa fuera de perfil estricto de producción.
- `python manage.py test users.tests_cookie_auth students.tests.PublicCertificateVerificationNotificationTest` → **OK (12 tests)**.
- `python manage.py test elections.tests.ElectionE2EFlowTests` → **OK (15 tests)**.

### Observaciones
- Hubo un intento inicial con nombre de clase de test inexistente en `elections.tests`; se corrigió la selección y las pruebas objetivo pasaron.

---

## 3) Estado de hallazgos (reevaluación)

## R-01. Endurecimiento por ambiente (`settings` + `entrypoint`)  
**Estado:** **CERRADO / MEJORADO**

**Evidencia:**
- `backend/kampus_backend/settings.py` ahora usa `DJANGO_ENV` e `IS_PRODUCTION`.
- En producción exige `DJANGO_SECRET_KEY`, rechaza claves débiles `django-insecure*` y bloquea `DEBUG=true`.
- `backend/entrypoint.sh` valida en arranque condiciones mínimas de producción.

**Impacto:** reduce riesgo de despliegues inseguros por defecto.

---

## R-02. Superusuario por defecto (`admin/admin123`)  
**Estado:** **CERRADO**

**Evidencia:**
- `backend/entrypoint.sh` cambió default `KAMPUS_CREATE_SUPERUSER` a `false`.
- Si se habilita, requiere `KAMPUS_SUPERUSER_PASSWORD`, valida longitud y bloquea valores débiles.

**Impacto:** se elimina vector crítico por credenciales conocidas.

---

## R-03. Contraseñas predecibles para estudiantes/docentes  
**Estado:** **CERRADO / MEJORADO**

**Evidencia:**
- `backend/students/serializers.py` y `backend/teachers/serializers.py` usan `generate_temporary_password()`.
- Se marca `must_change_password=True`.
- En importación CSV (`backend/students/views.py`) también se usa contraseña temporal robusta.

**Impacto:** mejora sustancial contra toma de cuentas por adivinación.

---

## R-04. Falta de throttling en login/refresh  
**Estado:** **CERRADO / MEJORADO**

**Evidencia:**
- `backend/kampus_backend/throttles.py` implementa throttles por IP y por username.
- `backend/kampus_backend/auth_views.py` aplica throttles en `/api/auth/login/` y `/api/auth/refresh/`.
- `settings.py` expone tasas configurables en `DEFAULT_THROTTLE_RATES`.

**Impacto:** menor superficie para fuerza bruta y abuso de refresh.

---

## R-05. Warnings de `check --deploy` en ejecución actual  
**Estado:** **PENDIENTE OPERATIVO / DEPENDE DE ENTORNO**

**Evidencia:**
- El comando reporta (`W004`, `W008`, `W012`, `W016`, `W018`, `W009`) bajo entorno de desarrollo.

**Interpretación técnica:**
- No necesariamente indica vulnerabilidad activa en producción.
- Sí indica que, sin variables de entorno de producción correctamente definidas, el despliegue queda en postura insegura.

**Recomendación:**
- Ejecutar `check --deploy` en pipeline con `DJANGO_ENV=production` y variables reales de producción para validación final.

---

## R-06. Privacidad de datos en verificaciones públicas  
**Estado:** **PARCIAL / REQUIERE POLÍTICA**

**Evidencia:**
- El sistema mantiene endpoints públicos de verificación de documentos/certificados.

**Riesgo residual:**
- Posible exposición de PII si el payload público no está minimizado.

**Recomendación:**
- Enmascarar datos sensibles (ej. documento parcial), limitar campos retornados y formalizar política de divulgación mínima por endpoint público.

---

## 4) Otros bugs/riesgos funcionales observados

## B-01. Resultado de pruebas puede inducir falso positivo por selección de test incorrecta
- Se detectó error inicial de nomenclatura de clase de prueba en `elections.tests`.
- No impacta producto final, pero sí calidad del proceso de auditoría/CI si no se parametriza correctamente.

## B-02. Dependencia de variables de entorno para postura segura
- Si no existe disciplina de configuración por ambiente, la app puede quedar en modo permisivo de desarrollo.
- Recomendado: checklist de release y validaciones de arranque obligatorias en CI/CD.

---

## 5) Matriz DOFA actualizada

| **Fortalezas** | **Oportunidades** |
|---|---|
| Endurecimiento real del backend por ambiente (`DJANGO_ENV`, validaciones en arranque). | Integrar `check --deploy` con variables de producción en CI como control de salida. |
| Remediación de contraseñas predecibles con `must_change_password`. | Fortalecer UX de primer acceso (activación guiada y cambio de clave asistido). |
| Throttling dedicado para login/refresh y endpoints públicos. | Incorporar alertas de seguridad (picos de 401/403, abuso de endpoints públicos). |
| Tests focalizados de auth y votación pública pasando. | Expandir pruebas de privacidad y protección de datos públicos. |

| **Debilidades** | **Amenazas** |
|---|---|
| Warnings de seguridad aparecen si no se usa perfil de producción correcto. | Error humano en despliegue puede reabrir riesgos de hardening. |
| Persisten posibles exposiciones de PII en validaciones públicas (según payload). | Abuso de URLs públicas compartidas o filtradas. |
| Ausencia de verificación automatizada de posture en release final (si no se implementa CI estricto). | Riesgo reputacional/compliance por manejo de datos personales. |

---

## 6) Recomendaciones priorizadas (enfoque usuario final)

## Prioridad 0 (inmediata)
1. Cerrar el ciclo DevSecOps: ejecutar `check --deploy` con `DJANGO_ENV=production` en CI y bloquear releases si falla.
2. Definir plantilla única de variables de producción y runbook de despliegue seguro.

## Prioridad 1 (1-2 semanas)
1. Reducir y enmascarar PII en respuestas públicas de verificación.
2. Agregar auditoría específica de accesos públicos (métricas/alertas por patrón anómalo).

## Prioridad 2 (2-4 semanas)
1. Añadir SAST/SCA automatizado en pipeline.
2. Revisar UX de onboarding de contraseñas temporales para reducir fricción y tickets de soporte.

---

## 7) Conclusión

La reejecución confirma que el proyecto avanzó de forma importante en seguridad técnica y control de acceso. Las brechas críticas detectadas en la auditoría previa muestran remediación efectiva. El riesgo principal actual se concentra en **disciplina de configuración por entorno** y **minimización de datos en endpoints públicos**.
