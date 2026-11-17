import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const base = process.env.VITE_BASE_PATH || '/';
  const rootDir = import.meta.dirname;
  const apiBaseUrl = String(process.env.VITE_API_BASE_URL || '').trim();

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'rental-gate-env-inject',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            const normalizedBase = base.endsWith('/') ? base : `${base}/`;
            const injectScript = `    <script>window.__RG_BASE_URL__ = ${JSON.stringify(normalizedBase)}; window.__RG_API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};</script>\n`;
            const withBasePaths = html
              .replace(/(src|href)="\.\/assets\//g, `$1="${normalizedBase}assets/`);
            return withBasePaths.replace('</head>', `${injectScript}  </head>`);
          },
        },
      },
      {
        name: 'copy-static-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distSrcAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distSrcAssets, { recursive: true, force: true });
          }
          const rootAssets = path.resolve(rootDir, 'assets');
          const distRootAssets = path.resolve(distDir, 'assets');
          if (fs.existsSync(distDir) && fs.existsSync(rootAssets)) {
            fs.cpSync(rootAssets, distRootAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy:
        command === 'serve'
          ? {
              '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
              },
            }
          : undefined,
    },
  };
});
