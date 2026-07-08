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
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '/').split('?')[0];
        if (!pathname.startsWith('/plat-web/')) {
          next();
          return;
        }

        const relPath = decodeURIComponent(pathname.slice('/plat-web/'.length));
        const filePath = path.resolve(platWebRoot, relPath);

        if (!filePath.startsWith(platWebRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.statusCode = 404;
          res.end(`Plat asset not found: ${relPath}`);
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
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
});
