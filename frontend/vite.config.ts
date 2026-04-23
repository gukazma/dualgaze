import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';
import { createReadStream, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function serveDatas(): Plugin {
  const root = resolve(__dirname, '..', 'datas');
  return {
    name: 'dualgaze-serve-datas',
    configureServer(server) {
      server.middlewares.use('/datas', (req, res, next) => {
        const p = (req.url ?? '').split('?')[0];
        const filePath = resolve(join(root, decodeURIComponent(p)));
        if (!filePath.startsWith(root)) return next();
        try {
          const st = statSync(filePath);
          if (!st.isFile()) return next();
          const lower = filePath.toLowerCase();
          if (lower.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
          else if (lower.endsWith('.b3dm')) res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(st.size));
          createReadStream(filePath).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), cesium(), serveDatas()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
