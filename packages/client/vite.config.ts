import { defineConfig } from 'vite';
// base './' so the build works from any URL (published page, local file server, CDN path)
export default defineConfig({ base: './', server: { port: 5173, host: true }, build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0, assetsDir: 'build', chunkSizeWarningLimit: 2000 } });
