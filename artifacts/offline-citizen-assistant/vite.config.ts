import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
const __filename = fileURLToPath(import.meta.url);
const configDirectory = path.dirname(__filename);
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const basePath = process.env.BASE_PATH || "/";
// const rawPort = process.env.PORT;

// if (!rawPort) {
//   throw new Error(
//     'PORT environment variable is required but was not provided.',
//   );
// }

// const port = Number(rawPort);

// if (Number.isNaN(port) || port <= 0) {
//   throw new Error(`Invalid PORT value: "${rawPort}"`);
// }

// const basePath = process.env.BASE_PATH;

// if (!basePath) {
//   throw new Error(
//     'BASE_PATH environment variable is required but was not provided.',
//   );
// }

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(configDirectory, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, 'src'),
      '@assets': path.resolve(
        configDirectory,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: configDirectory,
  build: {
    outDir: path.resolve(configDirectory, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
