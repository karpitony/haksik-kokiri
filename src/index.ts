import app from './api'
import { scheduledTask } from './tasks/cron'

export default {
  fetch: app.fetch,           // Hono API
  scheduled: scheduledTask    // 크론잡
}
