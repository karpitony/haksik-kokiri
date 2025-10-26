export async function scheduledTask(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  console.log('⏰ Cron triggered at', new Date().toISOString())

  try {
    // 예: 외부 API 호출 or Cloudflare KV 업데이트 등
    const res = await fetch('https://example.com/ping')
    const result = await res.text()
    console.log('✅ Ping result:', result)
  } catch (err) {
    console.error('❌ Cron job failed:', err)
  }
}
