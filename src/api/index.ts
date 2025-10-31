import { Hono } from 'hono'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => c.text('Hello from Hono API 🌥️'))
app.get('/api/ping', (c) => c.json({ message: 'pong' }))

export default app
