import app from './api'
import { updateMealsCron } from './tasks/cron'

export default {
  fetch: app.fetch,           // Hono API
  scheduled: updateMealsCron    // 크론잡
}
