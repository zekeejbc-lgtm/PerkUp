import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { Readable } from 'node:stream';
import {defineConfig} from 'vite';

const googleDriveMediaProxy = () => ({
  name: 'google-drive-media-proxy',
  configureServer(server: { middlewares: { use: (handler: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use(async (req, res, next) => {
      const requestUrl = new URL(req.url || '/', 'http://localhost');
      const match = requestUrl.pathname.match(/^\/media\/google-drive\/([A-Za-z0-9_-]+)$/);
      if (!match) return next();

      const upstreamUrl = new URL('https://drive.usercontent.google.com/download');
      upstreamUrl.searchParams.set('export', 'download');
      upstreamUrl.searchParams.set('id', match[1]);
      upstreamUrl.searchParams.set('confirm', 't');
      const resourceKey = requestUrl.searchParams.get('resourcekey');
      if (resourceKey) upstreamUrl.searchParams.set('resourcekey', resourceKey);

      try {
        const headers = new Headers();
        if (req.headers.range) headers.set('Range', req.headers.range);
        if (req.headers['if-range']) headers.set('If-Range', req.headers['if-range']);
        const upstream = await fetch(upstreamUrl, { headers, redirect: 'follow' });
        res.statusCode = upstream.status;
        ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified'].forEach((name) => {
          const value = upstream.headers.get(name);
          if (value) res.setHeader(name, value);
        });
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (!upstream.body) return res.end();
        Readable.fromWeb(upstream.body as any).pipe(res);
      } catch (error) {
        console.error('Google Drive media proxy failed', error);
        if (!res.headersSent) res.statusCode = 502;
        res.end('Video is temporarily unavailable.');
      }
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), googleDriveMediaProxy()],
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
