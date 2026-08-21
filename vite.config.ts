import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@supabase/') || id.includes('\\@supabase\\')) return 'supabase-vendor';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor';
            if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) return 'map-vendor';
            if (id.includes('/@yudiel/react-qr-scanner/')) return 'scanner-vendor';
            if (id.includes('/qrcode.react/')) return 'qr-vendor';
            return undefined;
          },
        },
      },
    },
  };
});
