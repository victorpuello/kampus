# Runbook Unificado: Deploy + Desarrollo (Kampus)

Objetivo: tener un solo documento operativo para desplegar sin romper produccion y desarrollar sin introducir bugs recurrentes.

Aplica para el entorno actual:
- Servidor: `108.61.224.72`
- Repo produccion: `/var/www/kampus.ieplayasdelviento.edu.co`
- Dominio: `https://kampus.ieplayasdelviento.edu.co`
- Stack: Nginx + Docker Compose + Django + Celery + React/Vite

---

## 1) Reglas de oro (obligatorias)

1. Nunca desplegar sin backup (DB + privados + `.env`).
2. Nunca hacer `git pull` con arbol sucio en produccion.
3. Nunca editar `.env` sin recrear contenedores afectados.
4. Nunca dejar `localhost` en frontend build de produccion.
5. Siempre validar con smoke tests HTTP antes de cerrar deploy.
6. Si hay `301`/`302`/`403` en webhook Meta, no funcionara Verify.

---

## 2) Checklist de pre-deploy (5 minutos)

```bash
ssh linuxuser@108.61.224.72
cd /var/www/kampus.ieplayasdelviento.edu.co

# 1) Estado git limpio
git status --porcelain=v1

# 2) Espacio en disco
df -h

# 3) Estado contenedores
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# 4) Variables criticas en .env
grep -nE '^(KAMPUS_PUBLIC_SITE_URL|KAMPUS_FRONTEND_BASE_URL|KAMPUS_BACKEND_BASE_URL|DJANGO_SECURE_PROXY_SSL_HEADER|KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN)=' .env

# 5) Compose renderizado con URLs publicas en servicios criticos
bash scripts/check_prod_public_urls.sh
```

Si `git status` no esta limpio, resolver primero (stash/commit/restore) antes de deploy.

---

## 3) Deploy estandar de produccion (SOP)

### Paso A - Backup obligatorio

```bash
# ejemplo rapido de carpeta backup
sudo mkdir -p /var/backups/kampus/$(date +%F-%H%M)
```

Recomendado minimo:
- dump de Postgres
- backup de `/data/kampus_private`
- copia de `.env`

### Paso B - Deploy

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
sudo /usr/local/bin/kampus-deploy-latest.sh
```

### Paso C - Recreate de servicios cuando cambie env/config

Si cambiaste `.env`, `docker-compose.prod.yml` o settings de proxy:

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend backend_worker backend_scheduler backend_beat
sudo systemctl restart nginx
```

---

## 4) Validaciones post-deploy (obligatorias)

```bash
# Home
curl -I https://kampus.ieplayasdelviento.edu.co/

# Admin login
curl -I https://kampus.ieplayasdelviento.edu.co/admin/login/

# CSRF
curl -I https://kampus.ieplayasdelviento.edu.co/api/auth/csrf/
```

Esperado: `HTTP 200` o redirecciones validas de app (no 5xx).

### Validacion de migraciones

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py showmigrations --plan | grep '\[ \]' || echo 'Sin migraciones pendientes'
```

### Smoke check de URLs publicas inyectadas

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
bash scripts/smoke_check_public_urls.sh
```

Esperado:
- `backend`, `backend_worker` y `backend_beat` exponen `KAMPUS_PUBLIC_SITE_URL`, `KAMPUS_FRONTEND_BASE_URL` y `KAMPUS_BACKEND_BASE_URL`
- Ninguna apunta a `localhost` o `127.0.0.1`

---

## 5) Webhook WhatsApp (Meta) - prueba canonica

Token de verify debe ser exactamente igual en:
1. Meta (Webhook Verify Token)
2. `.env` backend (`KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
3. Kampus Admin (Sistema -> WhatsApp, `environment=production`)

### Prueba previa a Meta

```bash
curl -i --get "https://kampus.ieplayasdelviento.edu.co/api/communications/webhooks/whatsapp/meta/" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=TU_TOKEN" \
  --data-urlencode "hub.challenge=123456"
```

Esperado:
- `HTTP 200`
- body exacto: `123456`

Si devuelve `301`, `302`, `403` o `502`, no presionar Verify en Meta hasta corregir.

---

## 6) Configuracion Nginx/Proxy que evita bugs de login y webhook

En el bloque proxy de API/Admin debe existir:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```

Validar archivo activo y sintaxis:

```bash
sudo nginx -t
sudo nginx -T | sed -n '/server_name kampus.ieplayasdelviento.edu.co/,/}/p'
```

No dejar backups como archivos activos en `sites-enabled` (ej. `.bak`) porque generan `conflicting server name`.

---

## 7) Configuracion backend que evita redirecciones erroneas

En `.env` produccion:

```env
DJANGO_SECURE_PROXY_SSL_HEADER=true
KAMPUS_PUBLIC_SITE_URL=https://kampus.ieplayasdelviento.edu.co
KAMPUS_FRONTEND_BASE_URL=https://kampus.ieplayasdelviento.edu.co
KAMPUS_BACKEND_BASE_URL=https://kampus.ieplayasdelviento.edu.co
```

Validacion runtime (dentro de backend):

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
cat > /tmp/check_ssl.py <<"PY"
from django.conf import settings
print(settings.SECURE_SSL_REDIRECT)
print(settings.SECURE_PROXY_SSL_HEADER)
PY
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py shell < /tmp/check_ssl.py
rm -f /tmp/check_ssl.py
```

Esperado:
- `True`
- `('HTTP_X_FORWARDED_PROTO', 'https')`

---

## 8) Frontend: reglas para no volver a romper produccion

1. Build con variables de produccion:

```bash
cd /var/www/kampus.ieplayasdelviento.edu.co/kampus_frontend
sudo -u linuxuser -H npm install --legacy-peer-deps
sudo -u linuxuser -H env SITE_URL=https://kampus.ieplayasdelviento.edu.co VITE_API_BASE_URL=https://kampus.ieplayasdelviento.edu.co npm run build
```

2. Confirmar que `dist` no tenga localhost:

```bash
grep -R "localhost:8000" /var/www/kampus.ieplayasdelviento.edu.co/kampus_frontend/dist -n || echo "OK sin localhost"
```

3. Si la UI sigue vieja: limpiar cache SW en navegador (unregister + hard reload).

---

## 9) Desarrollo local seguro (sin contaminar produccion)

### Flujo recomendado por rama

```bash
# siempre partir de main actualizado
git checkout main
git pull origin main

git checkout -b feature/nombre-cambio
```

### Antes de abrir PR

- Ejecutar pruebas de backend (minimo tests del modulo tocado).
- Ejecutar build de frontend local.
- Revisar que no haya secretos hardcodeados.
- Revisar migraciones nuevas (`python manage.py makemigrations --check`).

### Convenciones practicas

- Cambios de infraestructura (`compose`, `nginx`, `.env`) deben ir con checklist de validacion.
- Si agregas nueva dependencia frontend, deja instalado/lock actualizado y valida build en servidor.
- Evitar mezclar refactor grande + cambio operativo en un solo deploy.

---

## 10) Matriz de incidentes comunes y solucion rapida

### A) `HTTP 502` en `/api/...`

Causas tipicas:
- backend reiniciando/migrando
- backend caido

Acciones:
```bash
cd /var/www/kampus.ieplayasdelviento.edu.co
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps backend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 backend
```

### B) Webhook Meta devuelve `301`

Causa tipica:
- Django no reconoce cabecera HTTPS proxy (`SECURE_PROXY_SSL_HEADER=None`)

Acciones:
- confirmar `DJANGO_SECURE_PROXY_SSL_HEADER=true` en `.env`
- asegurar variable inyectada en `backend` de `docker-compose.prod.yml`
- recrear `backend`
- confirmar `X-Forwarded-Proto https` en Nginx

### C) Frontend no refleja cambios

Causas tipicas:
- `dist` viejo
- cache de service worker

Acciones:
- rebuild frontend
- validar hashes nuevos en `dist/assets`
- limpiar SW/cache en navegador

### D) Deploy falla por espacio en disco

Acciones:
```bash
df -h
sudo docker system df
sudo docker builder prune -a -f
sudo docker image prune -a -f
sudo docker volume prune -f
```

Ejecutar limpieza con cuidado y solo con ventana de mantenimiento.

---

## 11) Comando de verificacion final (cierre de deploy)

```bash
echo "=== HEALTHCHECK KAMPUS ==="
curl -s -o /dev/null -w "HOME: %{http_code}\n" https://kampus.ieplayasdelviento.edu.co/
curl -s -o /dev/null -w "ADMIN: %{http_code}\n" https://kampus.ieplayasdelviento.edu.co/admin/login/
curl -s -o /dev/null -w "CSRF: %{http_code}\n" https://kampus.ieplayasdelviento.edu.co/api/auth/csrf/
```

Si no hay 5xx y flujos criticos responden bien, deploy cerrado.

---

## 12) Control de cambios recomendado

Mantener en cada despliegue un registro simple:
- fecha/hora
- commit SHA
- quien desplego
- migraciones aplicadas (si/no)
- resultado smoke tests
- incidentes y correccion

Esto acelera diagnostico y evita repetir errores.
