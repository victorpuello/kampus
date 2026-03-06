# Guia paso a paso: configuracion completa de WhatsApp (Meta Cloud API) en Kampus

Este documento deja el canal WhatsApp operativo end-to-end: Meta + Kampus + pruebas + salida a produccion.

## 1. Objetivo

Al finalizar esta guia debes tener:

- Canal WhatsApp habilitado en Kampus.
- Webhook de Meta verificado y recibiendo estados (`sent`, `delivered`, `read`, `failed`).
- Plantillas aprobadas en Meta y mapeadas en Kampus.
- Notificaciones de Kampus saliendo por WhatsApp en forma asincrona.
- Salud operativa visible en panel admin.

## 2. Requisitos previos

- Acceso admin/superadmin en Kampus.
- Acceso admin en Meta Business Manager.
- Dominio publico HTTPS para backend (en produccion).
- Base de datos migrada con `communications.0011_whatsappsettings`.
- Worker Celery activo (si usas envio asincrono normal de Kampus).

## 3. Configuracion en Meta (Cloud API)

## 3.1 Crear app en Meta

1. En Meta for Developers crea una app tipo `Business`.
2. Agrega el producto `WhatsApp`.
3. Vincula la app a tu Business Portfolio/WABA.

## 3.2 Preparar numero y WABA

1. Registra o conecta el numero de telefono en WABA.
2. Confirma que el numero quede activo para envio.
3. Copia y guarda:
- `Phone Number ID`
- `WABA ID` (referencia operativa)

## 3.3 Crear usuario de sistema y token

1. En Business Settings crea un `System User` (preferible admin).
2. Asigna activos de WhatsApp al system user.
3. Genera token de larga duracion con permisos:
- `whatsapp_business_messaging`
- `whatsapp_business_management`
4. Guarda el token como secreto (no en texto plano en docs o chat).

## 3.4 Configurar webhook de Meta

1. URL callback (produccion):
- `https://<tu-dominio-backend>/api/communications/webhooks/whatsapp/meta/`
2. Define un `Verify Token` seguro (string larga).
3. En Meta, verifica webhook con ese token.
4. Suscribe el campo `messages` para recibir eventos de estado.

Nota: Kampus valida firma HMAC con `X-Hub-Signature-256` usando `app_secret`.

## 3.5 Crear y aprobar plantillas en Meta

1. Crea plantillas segun tipo de mensaje (utility/marketing/authentication).
2. Espera estado `APPROVED`.
3. Documenta nombre exacto y `language_code` (ejemplo `es_CO`).

## 4. Configuracion en Kampus

## 4.1 Migraciones backend

Ejecuta:

```bash
/usr/local/bin/python3 backend/manage.py migrate
```

## 4.2 Variables de entorno recomendadas

Revisa `env.backend.example` y define como minimo:

- `KAMPUS_WHATSAPP_ENABLED`
- `KAMPUS_WHATSAPP_PROVIDER`
- `KAMPUS_WHATSAPP_GRAPH_BASE_URL`
- `KAMPUS_WHATSAPP_API_VERSION`
- `KAMPUS_WHATSAPP_PHONE_NUMBER_ID`
- `KAMPUS_WHATSAPP_ACCESS_TOKEN`
- `KAMPUS_WHATSAPP_APP_SECRET`
- `KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `KAMPUS_WHATSAPP_WEBHOOK_STRICT`
- `KAMPUS_WHATSAPP_SEND_MODE`

Para observabilidad:

- `KAMPUS_WHATSAPP_ALERT_MAX_FAILED`
- `KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE`
- `KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED`
- `KAMPUS_WHATSAPP_HEALTH_BEAT_MINUTE`
- `KAMPUS_WHATSAPP_HEALTH_BEAT_HOUR`
- `KAMPUS_WHATSAPP_HEALTH_BEAT_DAY_OF_WEEK`

## 4.3 Reiniciar servicios

- Backend Django
- Celery worker
- Celery beat (si usas chequeos programados)

## 4.4 Configurar desde panel admin Kampus

Ruta UI:

- `Sistema` -> tab `WhatsApp`

Configura por entorno (`development` y `production` por separado):

1. `enabled` (activar al final de pruebas)
2. `provider` (`meta_cloud_api`)
3. `graph_base_url` (`https://graph.facebook.com`)
4. `api_version` (ejemplo `v21.0`)
5. `phone_number_id`
6. `access_token`
7. `app_secret`
8. `webhook_verify_token`
9. `webhook_strict`
10. `http_timeout_seconds`
11. `send_mode` (`template` recomendado)
12. `template_fallback_name` (opcional, recomendado)

## 4.5 Mapear tipos de notificacion a plantillas

En la misma pantalla (`Mapeo de plantillas WhatsApp`):

1. Crea un mapeo por cada `notification_type` que uses.
2. Usa `template_name` exacto aprobado en Meta.
3. Define `language_code` correcto.
4. Define `category` correcta.
5. Marca `is_active=true`.

## 4.6 Contacto WhatsApp de usuarios

El envio solo ocurre si el usuario destino tiene contacto WhatsApp activo.

API disponible:

- `PUT /api/communications/whatsapp/me/`
- `GET /api/communications/whatsapp/me/`
- `DELETE /api/communications/whatsapp/me/`

Formato esperado: E.164 (ejemplo `+573001234567`).

## 4.7 Carga masiva inicial de contactos (opcional)

Si ya tienes telefonos registrados en perfiles de estudiantes, docentes y acudientes con usuario asociado, puedes sincronizarlos al modelo `WhatsAppContact` con:

```bash
/usr/local/bin/python3 backend/manage.py sync_whatsapp_contacts --dry-run
```

Si el resultado es correcto, ejecuta la persistencia real:

```bash
/usr/local/bin/python3 backend/manage.py sync_whatsapp_contacts
```

Opciones utiles:

- `--overwrite`: actualiza el numero en contactos ya existentes del usuario.
- `--activate`: reactiva contactos inactivos (`is_active=false`).

Ejemplo completo:

```bash
/usr/local/bin/python3 backend/manage.py sync_whatsapp_contacts --overwrite --activate
```

## 5. Pruebas de validacion (checklist tecnico)

## 5.1 Webhook verify (Meta -> Kampus)

Debe responder `200` y devolver `hub.challenge` cuando token es correcto.

## 5.2 Prueba de lectura de settings

Endpoint admin:

- `GET /api/communications/settings/whatsapp/?environment=development`

Debe responder `200`.

## 5.3 Prueba de guardado de settings

Endpoint admin:

- `PUT /api/communications/settings/whatsapp/?environment=development`

Debe responder `200` y marcar secretos como configurados.

## 5.4 Prueba de envio real

1. Asegura contacto activo del usuario destino.
2. Genera una notificacion en Kampus (flujo real de negocio).
3. Verifica registro en `WhatsAppDelivery` con `status=SENT`.
4. Espera callback de Meta y valida transicion a `DELIVERED/READ`.

## 5.5 Prueba de salud operativa

- `GET /api/communications/settings/whatsapp/health/?hours=24`

Debe mostrar totales, errores y brechas de umbral.

## 6. Salida a produccion (runbook corto)

Referencia operativa recomendada:
- [Runbook unificado: deploy + desarrollo seguro](runbook_unificado_deploy_desarrollo.md)

1. Confirmar dominio HTTPS publico del backend.
2. Confirmar webhook de Meta verificado con URL productiva.
3. Cargar credenciales productivas en entorno `production` dentro de Kampus.
4. Cargar mapeos reales de plantillas aprobadas.
5. Activar `enabled=true` solo al final.
6. Enviar prueba controlada a un numero interno.
7. Revisar panel de salud y eventos por 24h.
8. Activar alerta programada (`KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED=true`).

## 7. Troubleshooting rapido

- Error `500` en settings:
  - Ejecutar migraciones y reiniciar backend.
  - Validar tabla `communications_whatsappsettings` existente.
- Mensaje no sale:
  - Revisar `enabled`, `phone_number_id`, `access_token`.
  - Revisar si el usuario tiene contacto WhatsApp activo.
- No llegan estados:
  - Revisar webhook URL publica y token verify.
  - Revisar firma HMAC (`app_secret`) y `webhook_strict`.
- Mucho `FAILED`:
  - Revisar codigo de error en `WhatsAppDelivery.error_code`.
  - Revisar calidad de plantilla/numero/politicas Meta.

## 8. Checklist final (marcar)

- [ ] App Meta creada y producto WhatsApp activo.
- [ ] Numero conectado y `phone_number_id` confirmado.
- [ ] System user + token con permisos correctos.
- [ ] Webhook de Meta verificado y suscrito.
- [ ] Plantillas aprobadas y registradas.
- [ ] Migraciones ejecutadas en Kampus.
- [ ] Credenciales guardadas en `development` y `production`.
- [ ] Mapeos de plantillas creados y activos.
- [ ] Contactos WhatsApp activos en usuarios de prueba.
- [ ] Prueba E2E enviada y estados recibidos.
- [ ] Health endpoint estable sin breach critico.
- [ ] Worker y beat en ejecucion continua.
