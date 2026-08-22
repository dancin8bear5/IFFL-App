import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Firebase dominates the bundle and changes only when the SDK is
        // upgraded, so splitting it out means an app-code deploy no longer
        // invalidates ~600KB of cached vendor JS for every member. React
        // gets the same treatment for the same reason.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
        },
      },
    },
    // The Firebase chunk is legitimately large; warning on it every build
    // trains everyone to ignore build output, which is worse.
    chunkSizeWarningLimit: 700,
  },
})
