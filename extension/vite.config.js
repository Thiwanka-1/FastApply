import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        options: resolve(__dirname, 'index.html'),      
        popup: resolve(__dirname, 'popup.html'),        
        sidepanel: resolve(__dirname, 'sidepanel.html')
      }
    }
  }
});