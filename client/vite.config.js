import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [
            react(),
            {
                name: 'html-inject-env',
                transformIndexHtml(html) {
                    return html.replace(
                        '<!-- GOOGLE_MAPS_SCRIPT -->',
                        `<script src="https://maps.googleapis.com/maps/api/js?key=${env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly&loading=async" async defer></script>`
                    )
                }
            }
        ],
        server: {
            host: true,
            proxy: {
                '/socket.io': {
                    target: 'http://localhost:3001',
                    ws: true
                }
            }
        }
    }
})
