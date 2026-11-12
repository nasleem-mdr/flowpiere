import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      include: '**/*.{jsx,js}',
    }),
    tailwindcss(),
    // VitePWA({
    //   strategies: 'injectManifest',
    //   srcDir: 'src',
    //   filename: 'service-worker.js',
    //   registerType: 'autoUpdate',
    // }),
    basicSsl(),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
    // Hanya saat `npm run build`: buang console.log/debug/info dan debugger.
    // console.warn & console.error tetap ada. Saat `npm run dev` tidak ada yang dibuang.
    ...(mode === 'production' && {
      pure: ['console.log', 'console.debug', 'console.info'],
      drop: ['debugger'],
    }),
  },
  server: {
    host: true,
    https: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));