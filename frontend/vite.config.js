import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  const base = process.env.VITE_BASE_PATH || '/';
  const apiBaseUrl = String(process.env.VITE_API_BASE_URL || '').trim();

  return {
    base,
    plugins: [
      tailwindcss(),
      {
        name: 'rental-gate-frontend-env',
        transformIndexHtml(html) {
          const normalizedBase = base.endsWith('/') ? base : `${base}/`;
          const injectScript = `    <script>window.__RG_BASE_URL__ = ${JSON.stringify(normalizedBase)}; window.__RG_API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};</script>\n`;
          return html.replace('</head>', `${injectScript}  </head>`);
        },
      },
      {
        name: 'copy-frontend-assets',
        apply: 'build',
        closeBundle(error) {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const rootAssets = path.resolve(__dirname, 'assets');
          const distAssets = path.resolve(distDir, 'assets');
          if (fs.existsSync(distDir) && fs.existsSync(rootAssets)) {
            fs.cpSync(rootAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    server: {
      proxy:
        command === 'serve'
          ? {
              '/api': {
                target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3000',
                changeOrigin: true,
              },
            }
          : undefined,
    },
  };
});
