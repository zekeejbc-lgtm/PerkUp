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
      if (requestUrl.pathname !== '/api/google-drive-video') return next();
      const fileId = requestUrl.searchParams.get('id') || '';
      if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
        res.statusCode = 400;
        return res.end('A valid Google Drive file ID is required.');
      }

      const upstreamUrl = new URL('https://drive.usercontent.google.com/download');
      upstreamUrl.searchParams.set('export', 'download');
      upstreamUrl.searchParams.set('id', fileId);
      upstreamUrl.searchParams.set('confirm', 't');
      const resourceKey = requestUrl.searchParams.get('resourcekey');
      if (resourceKey) upstreamUrl.searchParams.set('resourcekey', resourceKey);

      try {
        const rangeMatch = String(req.headers.range || '').match(/^bytes=(\d+)-(\d*)$/i);
        const rangeStart = rangeMatch ? Number(rangeMatch[1]) : 0;
        const requestedEnd = rangeMatch?.[2] ? Number(rangeMatch[2]) : rangeStart + (4 * 1024 * 1024) - 1;
        if (!Number.isSafeInteger(rangeStart) || !Number.isSafeInteger(requestedEnd) || rangeStart < 0 || requestedEnd < rangeStart) {
          res.statusCode = 416;
          res.setHeader('Accept-Ranges', 'bytes');
          return res.end('Only a single valid byte range is supported.');
        }
        const headers = new Headers();
        headers.set('Range', `bytes=${rangeStart}-${Math.min(requestedEnd, rangeStart + (4 * 1024 * 1024) - 1)}`);
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
