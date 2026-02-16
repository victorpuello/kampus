import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'vendor-ui'
            }
            if (id.includes('axios') || id.includes('zustand')) {
              return 'vendor-data'
            }
            return 'vendor-misc'
          }

          const pagesMatch = id.match(/src[\\/]pages[\\/]([^\\/]+)\.(t|j)sx?$/)
          if (pagesMatch?.[1]) {
            return `page-${pagesMatch[1].toLowerCase()}`
          }

          if (id.includes('src/layouts/')) {
            return 'layout'
          }

          if (id.includes('src/services/')) {
            return 'services'
          }

          return undefined
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
})
