import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const isAnalyze = process.env.ANALYZE === 'true';

export default defineConfig(async () => {
  const plugins = [react()];

  if (isAnalyze) {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(visualizer({ open: true, gzipSize: true, filename: 'dist/bundle-report.html' }));
  }

  return {
    plugins,

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    assetsInclude: ['**/*.svg', '**/*.csv'],

    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-recharts': ['recharts'],
            'vendor-socket': ['socket.io-client'],
          },
        },
      },
    },

    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
