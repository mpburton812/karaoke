import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

function gitRef(command: string, fallback: string): string {
  try {
    return execSync(command).toString().trim()
  } catch {
    return fallback
  }
}

const commitHash = gitRef('git rev-parse --short HEAD', 'unknown')
const branchName = gitRef('git rev-parse --abbrev-ref HEAD', 'unknown')

/** Dev-only: current git HEAD on each request (Vite `define` is frozen at dev-server start). */
function devGitStampPlugin(): Plugin {
  return {
    name: 'karaoke-dev-git-stamp',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (req.method !== 'GET' || path !== '/__dev/git-stamp.json') {
          next()
          return
        }
        try {
          const commit = execSync('git rev-parse --short HEAD').toString().trim()
          const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ commit, branch }))
        } catch {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ commit: 'unknown', branch: 'unknown' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BRANCH_NAME__: JSON.stringify(branchName),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    devGitStampPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Karaoke Companion',
        short_name: 'Karaoke',
        description: 'Modern Karaoke Song Manager',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@mui')) {
              return 'vendor_mui';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
