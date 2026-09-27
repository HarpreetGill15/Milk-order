import type { Config } from 'tailwindcss'
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: { 50: '#eff6ff', 100: '#dbeafe', 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af' } }, boxShadow: { card: '0 3px 18px rgba(15, 23, 42, .08)' } } }, plugins: [] } satisfies Config
