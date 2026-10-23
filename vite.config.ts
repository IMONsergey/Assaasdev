import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.APCOSYS_DEV_API_TARGET;
  const proxy = target ? {
    '/backend': { target, changeOrigin: true, ws: true, secure: true, rewrite: (path: string) => path.replace(/^\/backend(?=\/|$)/, '') || '/' },
    '^/auth/(google|telegram)/callback(\\?|$)': { target, changeOrigin: true, secure: true },
    '^/(google|telegram)/link/callback(\\?|$)': { target, changeOrigin: true, secure: true },
  } : undefined;
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
  };
});
