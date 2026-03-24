import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        options: resolve(__dirname, 'index.html'),      // The main dashboard
        popup: resolve(__dirname, 'popup.html'),        // The extension dropdown
        sidepanel: resolve(__dirname, 'sidepanel.html') // The side panel
      }
    }
  }
})