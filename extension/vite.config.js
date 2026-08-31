import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        options: resolve(projectRoot, 'index.html'),
        popup: resolve(projectRoot, 'popup.html'),
        sidepanel: resolve(projectRoot, 'sidepanel.html')
      }
    }
  }
});
