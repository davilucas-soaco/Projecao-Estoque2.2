import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Proxy só para rotas reais da API (/api/...).
 * Não use prefixo `/api` sozinho: no Vite isso captura `/api.ts` e quebra o carregamento de módulos.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.SERVER_PORT || '3535';
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5257,
      proxy: {
        '^/api/': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
