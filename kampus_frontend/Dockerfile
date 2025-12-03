# Usar imagen base de Node.js (versión más reciente para compatibilidad con Vite 6+)
FROM node:22-alpine

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto de Vite
EXPOSE 5173

# Comando para desarrollo (asegurando que escuche en todas las interfaces)
CMD ["npm", "run", "dev", "--", "--host"]
