import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { claudeAnfrage, MODELL } from '../spiel/claude.mjs'
import { kostenRechner } from '../spiel/kosten.mjs'

const antwortMit = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })
const tmpPfad = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ns-')), 'kosten.json')

test('Anfrage: Haiku-5.5-konformer Body, ein Werkzeug zurueck, Kosten gebucht', async () => {
  let gesendet
  const fetchFn = async (url, init) => { gesendet = { url, init }; return antwortMit({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'sprechen', input: { text: 'Hi', an: null } }], usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 800 } })() }
  const kosten = kostenRechner({ pfad: tmpPfad() })
  const anfrage = claudeAnfrage({ schluessel: 'sk-test', kosten, fetchFn })
  const erg = await anfrage({ system: 'S', nachricht: 'N', tools: [{ name: 'sprechen' }] })
  assert.deepEqual(erg.werkzeug, { name: 'sprechen', eingabe: { text: 'Hi', an: null } })
  const body = JSON.parse(gesendet.init.body)
  assert.equal(body.model, MODELL)
  assert.deepEqual(body.thinking, { type: 'disabled' })
  assert.deepEqual(body.output_config, { effort: 'low' })
  assert.deepEqual(body.tool_choice, { type: 'auto', disable_parallel_tool_use: true })
  assert.equal(body.system[0].cache_control.type, 'ephemeral')
  assert.ok(!('temperature' in body) && !('top_p' in body))
  assert.equal(body.messages.at(-1).role, 'user')
  assert.equal(gesendet.init.headers['anthropic-version'], '2026-10-21')
  assert.equal(gesendet.init.headers['x-api-key'], 'sk-test')
  const t = kosten.heute()
  assert.equal(t.aufrufe, 1)
  assert.ok(Math.abs(t.dollar - (1000 * 0.10 + 50 * 0.50 + 800 * 0.01) / 1e6) < 1e-12)
})

test('Anfrage: refusal und reiner Text geben kein Werkzeug, 429 wird wiederholt, 400 wirft', async () => {
  const kosten = kostenRechner({ pfad: tmpPfad() })
  const r1 = await claudeAnfrage({ schluessel: 'k', kosten, fetchFn: antwortMit({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: {} }) })({ system: 'S', nachricht: 'N', tools: [] })
  assert.deepEqual(r1, { werkzeug: null, grund: 'refusal', kategorie: 'cyber' })
  const r2 = await claudeAnfrage({ schluessel: 'k', kosten, fetchFn: antwortMit({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hallo' }], usage: {} }) })({ system: 'S', nachricht: 'N', tools: [] })
  assert.equal(r2.werkzeug, null); assert.equal(r2.text, 'Hallo')
  let n = 0
  const wackelig = async () => (n++ === 0 ? antwortMit({}, 429)() : antwortMit({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'x', input: {} }], usage: {} })())
  const r3 = await claudeAnfrage({ schluessel: 'k', kosten, fetchFn: wackelig })({ system: 'S', nachricht: 'N', tools: [] })
  assert.equal(r3.werkzeug.name, 'x'); assert.equal(n, 2)
  await assert.rejects(claudeAnfrage({ schluessel: 'k', kosten, fetchFn: antwortMit({ error: { message: 'bad' } }, 400) })({ system: 'S', nachricht: 'N', tools: [] }), /API 400/)
})

test('Kostenbremse: ueber dem Tagesdeckel geht keine Anfrage mehr raus', async () => {
  const kosten = kostenRechner({ pfad: tmpPfad(), deckel: 0.001 })
  kosten.buchen({ input_tokens: 20000 })     // 0,002 $
  let gerufen = false
  const anfrage = claudeAnfrage({ schluessel: 'k', kosten, fetchFn: async () => { gerufen = true } })
  await assert.rejects(anfrage({ system: 'S', nachricht: 'N', tools: [] }), /Tagesdeckel/)
  assert.equal(gerufen, false)
})

test('Kostenzaehler: Tage getrennt, Datei atomar und privat', () => {
  const pfad = tmpPfad()
  let tag = '2026-10-31'
  const k = kostenRechner({ pfad, heute: () => tag })
  k.buchen({ input_tokens: 100 }); k.buchen({ output_tokens: 10 })
  assert.equal(k.heute().aufrufe, 2)
  tag = '2026-11-01'
  assert.equal(k.heute().aufrufe, 0)
  assert.equal(fs.statSync(pfad).mode & 0o777, 0o600)
  assert.ok(!fs.readdirSync(path.dirname(pfad)).some((f) => f.endsWith('.tmp')))
})
