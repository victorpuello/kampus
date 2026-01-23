# Usar imagen base de Python oficial
FROM python:3.11-slim

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema necesarias para psycopg2, netcat y renderizado PDF.
# Incluye dependencias para WeasyPrint (Pango/GDK-Pixbuf/Cairo) y fuentes básicas.
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    pkg-config \
    libcairo2-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu-core \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del proyecto
COPY . .

# Copiar y configurar entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Exponer el puerto
EXPOSE 8000

# Configurar entrypoint
ENTRYPOINT ["/bin/sh", "-c", "sed -i 's/\\r$//' /app/entrypoint.sh && exec /bin/sh /app/entrypoint.sh \"$@\"", "--"]

# Comando por defecto
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
