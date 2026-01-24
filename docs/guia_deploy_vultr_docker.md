# Guía de Deploy en Vultr con Docker

Esta guía te ayudará a desplegar la aplicación Kampus en un servidor Vultr usando Docker y Docker Compose.

## Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Crear Servidor en Vultr](#crear-servidor-en-vultr)
3. [Configuración Inicial del Servidor](#configuración-inicial-del-servidor)
4. [Instalación de Docker y Docker Compose](#instalación-de-docker-y-docker-compose)
5. [Clonar el Repositorio](#clonar-el-repositorio)
6. [Configurar Variables de Entorno](#configurar-variables-de-entorno)
7. [Configurar Proxy Reverso y SSL](#configurar-proxy-reverso-y-ssl)
8. [Iniciar la Aplicación](#iniciar-la-aplicación)
9. [Configurar Dominio DNS](#configurar-dominio-dns)
10. [Mantenimiento y Actualización](#mantenimiento-y-actualización)
11. [Backups](#backups)
12. [Monitoreo](#monitoreo)

---

## Requisitos Previos

- Cuenta en [Vultr](https://www.vultr.com/)
- Dominio propio (ej: `tuescuela.edu.co`)
- Cliente SSH en tu computadora local
- Conocimientos básicos de Linux y línea de comandos

---

## Crear Servidor en Vultr

1. **Iniciar sesión en Vultr** y crear un nuevo servidor (Deploy New Instance)

2. **Seleccionar ubicación**: Elige la región más cercana a Colombia (ej: Miami, US)

3. **Tipo de servidor**: Cloud Compute - Shared CPU

4. **Sistema Operativo**: Ubuntu 22.04 LTS x64

5. **Plan del servidor**: 
   - **Desarrollo/Testing**: 2 vCPU, 4GB RAM, 80GB SSD (~$18/mes)
   - **Producción pequeña**: 4 vCPU, 8GB RAM, 160GB SSD (~$36/mes)
   - **Producción mediana**: 6 vCPU, 16GB RAM, 320GB SSD (~$72/mes)

6. **Configuraciones adicionales**:
   - ✅ Enable IPv6
   - ✅ Enable Auto Backups (recomendado)
   - ✅ Agregar tu llave SSH pública (o crear una nueva)

7. **Hostname**: `kampus-prod` (o el nombre que prefieras)

8. Hacer clic en **Deploy Now** y esperar a que el servidor esté listo (~2 minutos)

---

## Configuración Inicial del Servidor

### 1. Conectarse al servidor

```bash
ssh root@IP_DEL_SERVIDOR
```

### 2. Actualizar el sistema

```bash
apt update && apt upgrade -y
```

### 3. Configurar el hostname

```bash
hostnamectl set-hostname kampus-prod
echo "127.0.0.1 kampus-prod" >> /etc/hosts
```

### 4. Configurar la zona horaria

```bash
timedatectl set-timezone America/Bogota
```

### 5. Crear un usuario no-root

```bash
adduser kampus
usermod -aG sudo kampus
```

### 6. Configurar SSH para el nuevo usuario

```bash
# Copiar las llaves SSH autorizadas
mkdir -p /home/kampus/.ssh
cp ~/.ssh/authorized_keys /home/kampus/.ssh/
chown -R kampus:kampus /home/kampus/.ssh
chmod 700 /home/kampus/.ssh
chmod 600 /home/kampus/.ssh/authorized_keys
```

### 7. Configurar firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

### 8. Salir y reconectarse con el nuevo usuario

```bash
exit
ssh kampus@IP_DEL_SERVIDOR
```

---

## Instalación de Docker y Docker Compose

### 1. Instalar dependencias

```bash
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
```

### 2. Agregar el repositorio oficial de Docker

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 3. Instalar Docker

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
```

### 4. Agregar tu usuario al grupo docker

```bash
sudo usermod -aG docker kampus
newgrp docker
```

### 5. Verificar la instalación

```bash
docker --version
docker run hello-world
```

### 6. Instalar Docker Compose

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

---

## Clonar el Repositorio

### 1. Instalar Git

```bash
sudo apt install -y git
```

### 2. Configurar Git (opcional pero recomendado)

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
```

### 3. Crear directorio para el proyecto

```bash
mkdir -p ~/apps
cd ~/apps
```

### 4. Clonar el repositorio

Si es repositorio privado, necesitarás configurar credenciales o usar un token:

```bash
git clone https://github.com/victorpuello/kampus.git
cd kampus
```

Si es privado con token de acceso personal:

```bash
git clone https://<TOKEN>@github.com/victorpuello/kampus.git
cd kampus
```

---

## Configurar Variables de Entorno

### 1. Crear archivo de configuración para producción

Crea un archivo `docker-compose.prod.yml`:

```bash
nano docker-compose.prod.yml
```

Contenido del archivo:

```yaml
services:
  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=${POSTGRES_DB:-kampus}
      - POSTGRES_USER=${POSTGRES_USER:-kampus}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    restart: unless-stopped
    networks:
      - kampus-network

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks:
      - kampus-network

  backend:
    build: ./backend
    volumes:
      - kampus_private_data:/data/kampus_private
      - kampus_media:/app/media
    environment:
      - DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
      - DJANGO_DEBUG=false
      - DJANGO_ALLOWED_HOSTS=${DJANGO_ALLOWED_HOSTS}
      - CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
      - POSTGRES_DB=${POSTGRES_DB:-kampus}
      - POSTGRES_USER=${POSTGRES_USER:-kampus}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_HOST=db
      - POSTGRES_PORT=5432
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - KAMPUS_PRIVATE_STORAGE_ROOT=/data/kampus_private
      - KAMPUS_PRIVATE_REPORTS_DIR=reports
      - KAMPUS_RUN_MIGRATIONS=true
      - KAMPUS_CREATE_SUPERUSER=false
    depends_on:
      - db
      - redis
    restart: unless-stopped
    networks:
      - kampus-network
    command: gunicorn kampus_backend.wsgi:application --bind 0.0.0.0:8000 --workers 4 --timeout 120

  backend_worker:
    build: ./backend
    volumes:
      - kampus_private_data:/data/kampus_private
      - kampus_media:/app/media
    environment:
      - DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
      - DJANGO_DEBUG=false
      - DJANGO_ALLOWED_HOSTS=${DJANGO_ALLOWED_HOSTS}
      - POSTGRES_DB=${POSTGRES_DB:-kampus}
      - POSTGRES_USER=${POSTGRES_USER:-kampus}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_HOST=db
      - POSTGRES_PORT=5432
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - KAMPUS_PRIVATE_STORAGE_ROOT=/data/kampus_private
      - KAMPUS_PRIVATE_REPORTS_DIR=reports
    depends_on:
      - db
      - redis
    restart: unless-stopped
    networks:
      - kampus-network
    command: celery -A kampus_backend worker -l INFO

  backend_scheduler:
    build: ./backend
    volumes:
      - kampus_private_data:/data/kampus_private
      - kampus_media:/app/media
    environment:
      - DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
      - DJANGO_DEBUG=false
      - POSTGRES_DB=${POSTGRES_DB:-kampus}
      - POSTGRES_USER=${POSTGRES_USER:-kampus}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_HOST=db
      - POSTGRES_PORT=5432
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    depends_on:
      - db
      - redis
    restart: unless-stopped
    networks:
      - kampus-network
    command: celery -A kampus_backend beat -l INFO

  frontend:
    build:
      context: ./kampus_frontend
      args:
        - VITE_API_BASE_URL=${VITE_API_BASE_URL}
        - VITE_APP_NAME=${VITE_APP_NAME:-Kampus}
        - SITE_URL=${SITE_URL}
    restart: unless-stopped
    networks:
      - kampus-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - kampus_media:/usr/share/nginx/html/media:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped
    networks:
      - kampus-network

volumes:
  postgres_data:
  kampus_private_data:
  kampus_media:

networks:
  kampus-network:
    driver: bridge
```

### 2. Crear archivo .env con las variables de entorno

```bash
nano .env
```

Contenido del archivo `.env`:

```bash
# Base de datos
POSTGRES_DB=kampus
POSTGRES_USER=kampus
POSTGRES_PASSWORD=TU_PASSWORD_SEGURO_AQUI_123456

# Django
DJANGO_SECRET_KEY=TU_SECRET_KEY_DJANGO_MUY_LARGO_Y_ALEATORIO
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=tudominio.edu.co,www.tudominio.edu.co,IP_DEL_SERVIDOR

# CORS
CORS_ALLOWED_ORIGINS=https://tudominio.edu.co,https://www.tudominio.edu.co

# Google Gemini API
GOOGLE_API_KEY=tu-google-api-key-aqui

# Frontend URLs
VITE_API_BASE_URL=https://tudominio.edu.co
VITE_APP_NAME=Kampus
SITE_URL=https://tudominio.edu.co
```

**Importante**: Genera valores seguros para las contraseñas y secret keys:

```bash
# Generar DJANGO_SECRET_KEY
python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'

# Generar contraseña segura para PostgreSQL
openssl rand -base64 32
```

### 3. Proteger el archivo .env

```bash
chmod 600 .env
```

---

## Configurar Proxy Reverso y SSL

### 1. Crear directorio para configuración de Nginx

```bash
mkdir -p nginx/ssl
```

### 2. Crear configuración de Nginx

```bash
nano nginx/nginx.conf
```

Contenido inicial (HTTP solamente, luego agregaremos HTTPS):

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 100M;

    # Logs
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Backend upstream
    upstream backend {
        server backend:8000;
    }

    # Frontend upstream
    upstream frontend {
        server frontend:80;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name tudominio.edu.co www.tudominio.edu.co;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name tudominio.edu.co www.tudominio.edu.co;

        # SSL certificates (temporalmente comentado hasta obtener certificados)
        # ssl_certificate /etc/nginx/ssl/fullchain.pem;
        # ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        # SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_session_timeout 10m;
        ssl_session_cache shared:SSL:10m;

        # API endpoints
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Django admin
        location /admin/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Django static files
        location /static/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
        }

        # Media files (uploads)
        location /media/ {
            alias /usr/share/nginx/html/media/;
            autoindex off;
        }

        # Frontend (React SPA)
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

**Importante**: Reemplaza `tudominio.edu.co` con tu dominio real.

### 3. Obtener certificados SSL con Certbot

Opción A - Usar Certbot directamente en el servidor:

```bash
sudo apt install -y certbot

# Detener temporalmente Nginx si ya está corriendo
sudo systemctl stop nginx

# Obtener certificado
sudo certbot certonly --standalone -d tudominio.edu.co -d www.tudominio.edu.co --email tu@email.com --agree-tos

# Copiar certificados a directorio nginx
sudo cp /etc/letsencrypt/live/tudominio.edu.co/fullchain.pem ~/apps/kampus/nginx/ssl/
sudo cp /etc/letsencrypt/live/tudominio.edu.co/privkey.pem ~/apps/kampus/nginx/ssl/
sudo chown kampus:kampus ~/apps/kampus/nginx/ssl/*.pem
```

Opción B - Usar el contenedor Certbot (más portable):

Agregar al `docker-compose.prod.yml`:

```yaml
  certbot:
    image: certbot/certbot
    volumes:
      - ./nginx/ssl:/etc/letsencrypt
      - ./nginx/certbot:/var/www/certbot
    command: certonly --webroot --webroot-path=/var/www/certbot --email tu@email.com --agree-tos --no-eff-email -d tudominio.edu.co -d www.tudominio.edu.co
```

### 4. Descomentar las líneas SSL en nginx.conf

Una vez tengas los certificados, edita `nginx/nginx.conf` y descomenta las líneas:

```nginx
ssl_certificate /etc/nginx/ssl/fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/privkey.pem;
```

---

## Iniciar la Aplicación

### 1. Actualizar el requirements.txt del backend para producción

Editar `backend/requirements.txt` y agregar:

```txt
gunicorn==21.2.0
```

### 2. Construir e iniciar los contenedores

```bash
cd ~/apps/kampus

# Construir las imágenes
docker compose -f docker-compose.prod.yml build

# Iniciar en segundo plano
docker compose -f docker-compose.prod.yml up -d
```

### 3. Verificar que todo esté funcionando

```bash
# Ver el estado de los contenedores
docker compose -f docker-compose.prod.yml ps

# Ver los logs
docker compose -f docker-compose.prod.yml logs -f
```

### 4. Crear el superusuario de Django

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

### 5. Recolectar archivos estáticos de Django

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput
```

---

## Configurar Dominio DNS

En tu proveedor de DNS (ej: Cloudflare, GoDaddy, etc.), configura los siguientes registros:

```
Tipo    Nombre              Valor               TTL
A       tudominio.edu.co    IP_DEL_SERVIDOR     Auto/300
A       www                 IP_DEL_SERVIDOR     Auto/300
```

Espera a que la propagación DNS se complete (puede tomar de 5 minutos a 48 horas).

Verifica con:

```bash
dig tudominio.edu.co
dig www.tudominio.edu.co
```

---

## Mantenimiento y Actualización

### Actualizar la aplicación desde GitHub

```bash
cd ~/apps/kampus

# Detener los contenedores
docker compose -f docker-compose.prod.yml down

# Obtener últimos cambios
git pull origin main

# Reconstruir y reiniciar
docker compose -f docker-compose.prod.yml up --build -d

# Ejecutar migraciones si es necesario
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Recolectar estáticos
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput
```

### Ver logs de la aplicación

```bash
# Todos los servicios
docker compose -f docker-compose.prod.yml logs -f

# Un servicio específico
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f backend_worker
```

### Reiniciar servicios

```bash
# Reiniciar todo
docker compose -f docker-compose.prod.yml restart

# Reiniciar un servicio específico
docker compose -f docker-compose.prod.yml restart backend
```

### Limpiar recursos no utilizados

```bash
# Limpiar imágenes antiguas
docker image prune -a

# Limpiar contenedores detenidos
docker container prune

# Limpiar todo (¡cuidado!)
docker system prune -a --volumes
```

---

## Backups

### 1. Backup manual de la base de datos

```bash
# Crear directorio para backups
mkdir -p ~/backups

# Backup de PostgreSQL
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U kampus kampus > ~/backups/kampus_$(date +%Y%m%d_%H%M%S).sql

# Comprimir el backup
gzip ~/backups/kampus_*.sql
```

### 2. Script de backup automático

Crear script `~/backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR=~/backups
COMPOSE_FILE=~/apps/kampus/docker-compose.prod.yml
DATE=$(date +%Y%m%d_%H%M%S)

# Crear directorio si no existe
mkdir -p $BACKUP_DIR

# Backup de PostgreSQL
echo "Backing up database..."
docker compose -f $COMPOSE_FILE exec -T db pg_dump -U kampus kampus > $BACKUP_DIR/kampus_$DATE.sql
gzip $BACKUP_DIR/kampus_$DATE.sql

# Backup de volúmenes de Docker
echo "Backing up Docker volumes..."
docker run --rm -v kampus_kampus_private_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/private_data_$DATE.tar.gz /data

# Eliminar backups antiguos (mantener últimos 7 días)
find $BACKUP_DIR -name "kampus_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "private_data_*.tar.gz" -mtime +7 -delete

echo "Backup completed successfully!"
```

Hacer ejecutable:

```bash
chmod +x ~/backup.sh
```

### 3. Configurar cron para backups automáticos

```bash
crontab -e
```

Agregar línea para backup diario a las 2 AM:

```cron
0 2 * * * /home/kampus/backup.sh >> /home/kampus/backup.log 2>&1
```

### 4. Restaurar desde backup

```bash
# Restaurar base de datos
gunzip < ~/backups/kampus_YYYYMMDD_HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U kampus kampus

# Restaurar volúmenes
docker run --rm -v kampus_kampus_private_data:/data -v ~/backups:/backup alpine tar xzf /backup/private_data_YYYYMMDD_HHMMSS.tar.gz -C /
```

---

## Monitoreo

### 1. Monitoreo básico con Docker stats

```bash
docker stats
```

### 2. Configurar alertas de uso de disco

Crear script `~/check_disk.sh`:

```bash
#!/bin/bash
THRESHOLD=80
CURRENT=$(df / | grep / | awk '{ print $5}' | sed 's/%//g')

if [ "$CURRENT" -gt "$THRESHOLD" ]; then
    echo "Disk usage is above ${THRESHOLD}%: ${CURRENT}%" | mail -s "Disk Alert on Kampus Server" tu@email.com
fi
```

Agregar a crontab (cada hora):

```cron
0 * * * * /home/kampus/check_disk.sh
```

### 3. Healthchecks con uptime monitoring

Puedes usar servicios gratuitos como:
- [UptimeRobot](https://uptimerobot.com/)
- [Healthchecks.io](https://healthchecks.io/)
- [StatusCake](https://www.statuscake.com/)

Configura un monitor HTTP para verificar:
- `https://tudominio.edu.co/api/` cada 5 minutos

---

## Seguridad Adicional

### 1. Configurar fail2ban

```bash
sudo apt install -y fail2ban

# Crear configuración para Nginx
sudo nano /etc/fail2ban/jail.local
```

Contenido:

```ini
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
```

Reiniciar:

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status
```

### 2. Renovación automática de certificados SSL

Si usaste Certbot directamente:

```bash
# Test de renovación
sudo certbot renew --dry-run

# Agregar a crontab para renovación automática
sudo crontab -e
```

Agregar:

```cron
0 3 * * * certbot renew --post-hook "docker compose -f /home/kampus/apps/kampus/docker-compose.prod.yml restart nginx"
```

### 3. Limitar acceso SSH

Editar `/etc/ssh/sshd_config`:

```bash
sudo nano /etc/ssh/sshd_config
```

Cambiar:

```
PermitRootLogin no
PasswordAuthentication no
```

Reiniciar SSH:

```bash
sudo systemctl restart ssh
```

---

## Troubleshooting

### Los contenedores no inician

```bash
# Ver logs detallados
docker compose -f docker-compose.prod.yml logs

# Ver estado
docker compose -f docker-compose.prod.yml ps -a
```

### Error "no space left on device"

```bash
# Limpiar imágenes no utilizadas
docker system prune -a

# Verificar espacio
df -h
```

### La base de datos no conecta

```bash
# Verificar que el contenedor de DB esté corriendo
docker compose -f docker-compose.prod.yml ps db

# Ver logs de la base de datos
docker compose -f docker-compose.prod.yml logs db

# Probar conexión manual
docker compose -f docker-compose.prod.yml exec db psql -U kampus -d kampus
```

### Error 502 Bad Gateway

```bash
# Verificar que el backend esté corriendo
docker compose -f docker-compose.prod.yml logs backend

# Reiniciar el backend
docker compose -f docker-compose.prod.yml restart backend
```

### Certificado SSL no funciona

```bash
# Verificar certificados
sudo certbot certificates

# Verificar configuración de Nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

---

## Recursos Adicionales

- [Documentación de Docker](https://docs.docker.com/)
- [Documentación de Django Deployment](https://docs.djangoproject.com/en/5.0/howto/deployment/)
- [Vultr Documentation](https://www.vultr.com/docs/)
- [Let's Encrypt](https://letsencrypt.org/docs/)

---

## Soporte

Para problemas específicos de Kampus:
- Repositorio: https://github.com/victorpuello/kampus
- Issues: https://github.com/victorpuello/kampus/issues

---

**Última actualización**: Enero 2026
