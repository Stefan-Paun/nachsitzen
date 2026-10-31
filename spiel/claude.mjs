// Duenner Aufruf der Messages-API ohne SDK (das Projekt hat keine Abhaengigkeiten).
// Gibt genau einen Werkzeug-Aufruf zurueck oder null (Ablehnung, kein Werkzeug, Fehler).
// Haiku 5.5: kein Prefill, keine temperature, thinking aus + effort low, Refusal kommt als HTTP 200.

export const MODELL = 'claude-haiku-5-5'
const URL = 'https://api.anthropic.com/v1/messages'

export function claudeAnfrage({ schluessel, kosten, fetchFn = globalThis.fetch, modell = MODELL, log = () => {} }) {
  return async function anfrage({ system, nachricht, tools, maxTokens = 500 }) {
    kosten?.pruefen()
    const body = {
      model: modell,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: [{ role: 'user', content: nachricht }],
    }
    let antwort
    for (let versuch = 0; versuch < 3; versuch++) {
      const r = await fetchFn(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': schluessel, 'anthropic-version': '2026-10-21' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      if (r.status === 429 || r.status >= 500) { log(`API ${r.status}, Versuch ${versuch + 1}`); await new Promise((f) => setTimeout(f, 800 * (versuch + 1))); continue }
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`API ${r.status}: ${text.slice(0, 300)}`)
      }
      antwort = await r.json()
      break
    }
    if (!antwort) return { werkzeug: null, grund: 'nicht erreichbar' }
    kosten?.buchen(antwort.usage)
    if (antwort.stop_reason === 'refusal') return { werkzeug: null, grund: 'refusal', kategorie: antwort.stop_details?.category }
    const block = (antwort.content || []).find((b) => b.type === 'tool_use')
    if (!block) return { werkzeug: null, grund: antwort.stop_reason, text: (antwort.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ') }
    return { werkzeug: { name: block.name, eingabe: block.input || {} }, usage: antwort.usage }
  }
}
