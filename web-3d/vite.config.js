import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platWebRoot = path.resolve(__dirname, '../web');

const MIME_TYPES = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.dzi': 'application/xml',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
};

function servePlatWeb() {
  return {
    name: 'serve-plat-web',
    configureServer(server) {
      server.middlewares.use('/plat-web', (req, res, next) => {
        const relPath = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, ''));
        const filePath = path.resolve(platWebRoot, relPath);

        if (!filePath.startsWith(platWebRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          next();
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), servePlatWeb()],
  base: './',
  build: {
    outDir: '../web/3d',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        proforma: path.resolve(__dirname, 'proforma.html'),
      },
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
});
