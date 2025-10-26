import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.text('Hello from Hono API 🌥️'))
app.get('/api/ping', (c) => c.json({ message: 'pong' }))

export default app
