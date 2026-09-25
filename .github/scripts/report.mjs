// Build-state report → Telegram. Pure formatter + one POST.
// No token configured → prints the report and exits 0 (never fails the run).
export function format(e) {
  const icon = (r) => (r === 'success' ? '✅' : r === 'skipped' || !r ? '⏭' : '❌')
  const ok = e.TEST === 'success' && e.DEPLOY === 'success' && e.SMOKE === 'success' && e.HEALTH === 'success'
  const title = (e.MSG || '').split('\n')[0].slice(0, 80)
  const lines = [
    `${ok ? '🟢' : '🔴'} IFFL deploy · ${String(e.SHA || '').slice(0, 7)} · ${title}`,
    `${icon(e.TEST)} tests (unit, rules, preview smoke)`,
    `${icon(e.DEPLOY === 'success' || e.SMOKE ? 'success' : e.DEPLOY)} deploy`,
    `${icon(e.SMOKE)} live smoke`,
  ]
  if (e.ROLLED_BACK === 'true') lines.push('↩️ hosting auto-rolled back (rules + functions were not)')
  lines.push(`${icon(e.HEALTH)} pollers`)
  lines.push(e.RUN_URL || '')
  return { ok, text: lines.filter(Boolean).join('\n') }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { text } = format(process.env)
  console.log(text)
  const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_CHAT_ID: chat, TELEGRAM_THREAD_ID: thread } = process.env
  if (t && chat) {
    const body = { chat_id: chat, text, disable_web_page_preview: true, ...(thread ? { message_thread_id: Number(thread) } : {}) }
    const r = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) console.error('Telegram send failed:', r.status, await r.text())
  } else {
    console.log('(no TELEGRAM_* secrets — report printed only)')
  }
}
