import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        enrollment: fileURLToPath(new URL('./pre-matricula.html', import.meta.url)),
        portal: fileURLToPath(new URL('./portal.html', import.meta.url)),
      },
    },
  },
});
