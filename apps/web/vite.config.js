import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: {
    proxy: {
      '/agent-api': {
        target: 'http://127.0.0.1:3001',
        rewrite: (path) => path.replace(/^\/agent-api/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
