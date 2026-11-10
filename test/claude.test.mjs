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

const ERFOLG = { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'x', input: {} }], usage: {} }
const leer = { system: 'S', nachricht: 'N', tools: [] }

test('Anfrage: Netzfehler wird wiederholt, Erfolg danach liefert das Werkzeug', async () => {
  let n = 0
  const fetchFn = async () => { if (n++ === 0) throw new TypeError('fetch failed'); return antwortMit(ERFOLG)() }
  const kosten = kostenRechner({ pfad: tmpPfad() })
  const erg = await claudeAnfrage({ schluessel: 'k', kosten, fetchFn, warte: 0 })(leer)
  assert.equal(erg.werkzeug.name, 'x'); assert.equal(n, 2)
  assert.equal(kosten.heute().aufrufe, 1)   // nur die erfolgreiche Antwort wird gebucht
})

test('Anfrage: dreimal Timeout gibt kein Werkzeug mit Grund zeit, dauerhafter Netzfehler Grund netz', async () => {
  let n = 0
  const kosten = kostenRechner({ pfad: tmpPfad() })
  const zeit = async () => { n++; throw new DOMException('timeout', 'TimeoutError') }
  assert.deepEqual(await claudeAnfrage({ schluessel: 'k', kosten, fetchFn: zeit, warte: 0 })(leer), { werkzeug: null, grund: 'zeit' })
  assert.equal(n, 3)
  const netz = async () => { throw new TypeError('fetch failed') }
  assert.deepEqual(await claudeAnfrage({ schluessel: 'k', kosten, fetchFn: netz, warte: 0 })(leer), { werkzeug: null, grund: 'netz' })
  assert.equal(kosten.heute().aufrufe, 0)
})

test('Anfrage: unbekannte Fehler aus fetchFn werfen weiter', async () => {
  const fetchFn = async () => { throw new RangeError('kaputt') }
  await assert.rejects(claudeAnfrage({ schluessel: 'k', fetchFn, warte: 0 })(leer), /kaputt/)
})

test('Anfrage: Retry-After wird gelesen und auf 5 s begrenzt, sonst gilt warte', async () => {
  const echt = globalThis.setTimeout
  const waits = []
  globalThis.setTimeout = (f, ms) => { waits.push(ms); return echt(f, 0) }
  try {
    const mit = (wert) => { let n = 0; return async () => (n++ === 0 ? { ok: false, status: 429, headers: new Headers(wert == null ? {} : { 'retry-after': wert }), text: async () => '' } : antwortMit(ERFOLG)()) }
    await claudeAnfrage({ schluessel: 'k', fetchFn: mit('1'), warte: 800 })(leer)
    await claudeAnfrage({ schluessel: 'k', fetchFn: mit('60'), warte: 800 })(leer)
    await claudeAnfrage({ schluessel: 'k', fetchFn: mit(null), warte: 7 })(leer)
  } finally { globalThis.setTimeout = echt }
  assert.deepEqual(waits, [1000, 5000, 7])
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
