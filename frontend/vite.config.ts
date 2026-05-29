import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
      }),
      react(),
    ],
    server: {
      port: parseInt(env.PORT || '5173'),
      fs: {
        // Allow serving files from one level up to the project root
        allow: ['..'],
      },
      proxy: {
        // Proxy API requests to the backend
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      // https://vitejs.dev/config/shared-options.html#resolve-alias
      alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('./node_modules', import.meta.url)),
      '~bootstrap': fileURLToPath(
        new URL('./node_modules/bootstrap', import.meta.url),
      ),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  build: {
    // Build Target
    // https://vitejs.dev/config/build-options.html#build-target
    target: 'esnext',
    // Minify option
    // https://vitejs.dev/config/build-options.html#build-minify
    minify: 'esbuild',
    // Rollup Options
    // https://vitejs.dev/config/build-options.html#build-rollupoptions
    rollupOptions: {
      output: {
        manualChunks: {
          // Split external library from transpiled code.
          react: ['react', 'react-dom'],
          axios: ['axios'],
        },
      },
    },
    // Disable module preload polyfill to avoid inline scripts
    modulePreload: {
      polyfill: false,
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Silence deprecation warnings caused by Bootstrap SCSS
        // which is out of our control.
        silenceDeprecations: [
          'mixed-decls',
          'color-functions',
          'global-builtin',
          'import',
        ],
      },
    },
  },
  }
})
