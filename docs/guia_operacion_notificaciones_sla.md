# Guía operativa: notificaciones SLA (novelties)

## 1) Objetivo
Operar y monitorear el flujo de notificaciones SLA de novedades (in-app + correo) con controles de salud, umbrales y pasos de respuesta ante incidentes.

## 2) Comandos operativos
- KPIs de ventana (24h, salida texto):
  - `python manage.py report_notifications_kpis --hours 24`
- KPIs de ventana (JSON, para integración):
  - `python manage.py report_notifications_kpis --hours 24 --format json`
- Health check (alerta por umbrales, falla con código no-cero):
  - `python manage.py check_notifications_health --hours 24`
- Health check sin romper pipeline:
  - `python manage.py check_notifications_health --hours 24 --no-fail-on-breach`

## 3) Variables de entorno (health)
- `KAMPUS_NOTIFICATIONS_ALERT_MAX_FAILED` (default: `10`)
- `KAMPUS_NOTIFICATIONS_ALERT_MAX_SUPPRESSED` (default: `50`)
- `KAMPUS_NOTIFICATIONS_ALERT_MIN_SUCCESS_RATE` (default: `90.0`)
- `KAMPUS_NOTIFICATIONS_ALERT_FAIL_ON_BREACH` (default: `true`)
- `KAMPUS_NOTIFICATIONS_ALERT_NOTIFY_ADMINS` (default: `false`)
- `KAMPUS_NOTIFICATIONS_HEALTH_LOOP_ENABLED` (default: `true` en dev scheduler)
- `KAMPUS_NOTIFICATIONS_HEALTH_INTERVAL_SECONDS` (default: `3600`)
- `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED` (default: `false` en base, `true` en prod override)
- `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_MINUTE` (default: `15`)
- `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_HOUR` (default: `*`)
- `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_DAY_OF_WEEK` (default: `1-5`)

## 4) KPIs recomendados
- Volumen in-app: `in_app.total`
- Cola pendiente de lectura: `in_app.unread`
- Entregas correo: `email.sent`, `email.failed`, `email.suppressed`, `email.pending`
- Tasa de éxito: `email.success_rate_percent` (sobre `SENT + FAILED`)
- Tasa de supresión: `email.suppression_rate_percent`
- Latencia promedio de envío: `email.avg_send_latency_seconds`

## 5) Umbrales iniciales sugeridos
- `failed` > 10 en 24h
- `suppressed` > 50 en 24h
- `success_rate` < 90%

Ajustar por entorno y volumen real de operación.

## 6) Flujo de respuesta a incidente
1. Ejecutar KPI JSON y health check para confirmar severidad:
   - `python manage.py report_notifications_kpis --hours 24 --format json`
   - `python manage.py check_notifications_health --hours 24 --no-fail-on-breach`
2. Revisar categorías y errores recientes en `communications_emaildelivery` (campo `error_message`).
3. Verificar configuración efectiva de correo (`MailgunSettings`) del entorno.
4. Si hay picos de `SUPPRESSED`, revisar causa (rebotes, complaints, unsubscribed).
5. Si hay picos de `FAILED`, validar credenciales/proveedor y conectividad.
6. En caso crítico, mantener ejecución manual de `notify_novelties_sla` mientras se estabiliza.

## 7) Verificación post-cambio
- Ejecutar `python manage.py check`.
- Ejecutar tests focalizados:
  - `python manage.py test notifications.tests.NotificationObservabilityCommandsTests --noinput`
  - `python manage.py test novelties.tests.NoveltySlaNotificationsCommandTests --noinput`
- Confirmar ausencia de duplicados y presencia de notificaciones en ventana de prueba.

## 8) Programación recomendada por entorno
- Desarrollo: mantener `KAMPUS_NOTIFICATIONS_HEALTH_LOOP_ENABLED=true` y `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED=false`.
- Producción: usar `KAMPUS_NOTIFICATIONS_HEALTH_LOOP_ENABLED=false` y `KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED=true`.
- Si se desea cortar alertamiento sin detener métrica, usar `KAMPUS_NOTIFICATIONS_ALERT_NOTIFY_ADMINS=false`.
