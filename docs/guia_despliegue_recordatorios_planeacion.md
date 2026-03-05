# Guia de despliegue - Recordatorios de planeacion docente

Fecha: 2026-03-04

## Objetivo
Activar y validar el job que notifica a docentes con planeacion faltante/incompleta del periodo actual.

Tipos de notificacion creados:
- `PLANNING_REMINDER_MISSING` (0% planeado)
- `PLANNING_REMINDER_INCOMPLETE` (<100% planeado)

Comando principal:
- `python manage.py notify_pending_planning_teachers`

Task Celery:
- `teachers.notify_pending_planning_teachers`

## 1. Pre-checks
Ejecutar en servidor con compose base + prod:

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml config >/dev/null && echo "compose ok"
```

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml exec -T backend python manage.py check
```

## 2. Despliegue de servicios
Recrear servicios backend para tomar cambios de codigo y env:

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml up -d backend backend_worker backend_beat
```

Validar que queden arriba:

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml ps
```

## 3. Verificacion funcional inmediata
### 3.1 Dry-run (sin escrituras)

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml exec -T backend python manage.py notify_pending_planning_teachers --dry-run
```

Esperado en salida:
- `evaluated=` mayor o igual a 0
- `missing_candidates=` y `incomplete_candidates=`
- `missing_created=0` y `incomplete_created=0` (por dry-run)

### 3.2 Ejecucion real controlada

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml exec -T backend python manage.py notify_pending_planning_teachers
```

Esperado en salida:
- `missing_created` y/o `incomplete_created` segun data real
- si se ejecuta por segunda vez el mismo dia: `*_created=0` por dedupe

## 4. Verificacion de scheduler (beat -> worker)
Comprobar despacho y consumo de task:

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml logs --tail 300 backend_beat backend_worker | egrep -i "notify-pending-planning-teachers|teachers.notify_pending_planning_teachers|Scheduler: Sending due task"
```

## 5. Verificacion de datos creados
### 5.1 Notificaciones in-app

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml exec -T backend python manage.py shell -c "from notifications.models import Notification; qs=Notification.objects.filter(type__in=['PLANNING_REMINDER_MISSING','PLANNING_REMINDER_INCOMPLETE']).order_by('-created_at')[:50]; print('total=', len(qs)); [print(f'{n.created_at}|{n.type}|{n.recipient.email}|{n.title}') for n in qs]"
```

### 5.2 Entregas de correo

```bash
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml exec -T backend python manage.py shell -c "from communications.models import EmailDelivery; qs=EmailDelivery.objects.filter(subject__icontains='planeacion').order_by('-created_at')[:50]; print('total=', len(qs)); [print(f'{d.created_at}|{d.status}|{d.recipient_email}|{d.subject}') for d in qs]"
```

## 6. Variables de entorno relevantes
- `KAMPUS_PLANNING_REMINDER_ENABLED`
- `KAMPUS_PLANNING_REMINDER_BEAT_ENABLED`
- `KAMPUS_PLANNING_REMINDER_BEAT_MINUTE`
- `KAMPUS_PLANNING_REMINDER_BEAT_HOUR`
- `KAMPUS_PLANNING_REMINDER_BEAT_DAY_OF_WEEK`
- `KAMPUS_PLANNING_REMINDER_DEDUPE_SECONDS`

## 7. Rollback rapido
Si hay comportamiento no deseado, desactivar beat del feature:

```bash
export KAMPUS_PLANNING_REMINDER_BEAT_ENABLED=false
docker compose -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.yml -f /var/www/kampus.ieplayasdelviento.edu.co/docker-compose.prod.yml up -d backend_beat
```

Opcionalmente mantener solo ejecucion manual del command hasta ajustar parametros.
