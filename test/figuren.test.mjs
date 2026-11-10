// Schema-Test fuer figuren/*.json und die daraus gerenderten Systemprompts. Reine Dateileser, kein Netz, kein Server.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ladeFigur, systemPrompt } from '../spiel/gehirn.mjs'
import { KI_FIGUREN } from '../server.mjs'
import { FRISUREN, zeichneFigur } from '../public/klasse.js'

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATEIEN = fs.readdirSync(path.join(WURZEL, 'figuren')).filter((d) => d.endsWith('.json')).sort()
const FIGUREN = DATEIEN.map((d) => ({ datei: d, figur: JSON.parse(fs.readFileSync(path.join(WURZEL, 'figuren', d), 'utf8')) }))
const ROLLEN = Object.keys(JSON.parse(fs.readFileSync(path.join(WURZEL, 'prompts', 'rollen.json'), 'utf8')))
const FARBE = /^#[0-9a-f]{6}$/i
const text = (v) => typeof v === 'string' && v.trim().length > 0

test('es gibt Figuren-Dateien und Rollen', () => {
  assert.ok(FIGUREN.length >= 7)
  assert.ok(ROLLEN.length >= 3)
})

for (const { datei, figur } of FIGUREN) {
  test(`${datei}: Pflichtfelder und Typen`, () => {
    const id = datei.replace(/\.json$/, '')
    assert.equal(figur.name, id.charAt(0).toUpperCase() + id.slice(1), 'name = Dateiname großgeschrieben')
    assert.ok(Number.isInteger(figur.alter) && figur.alter >= 14 && figur.alter <= 19, 'alter 14-19')
    assert.ok(text(figur.beschreibung), 'beschreibung')
    assert.ok(text(figur.stil), 'stil')
    assert.ok(Array.isArray(figur.beispiele) && figur.beispiele.length === 3, 'genau 3 beispiele')
    for (const b of figur.beispiele) assert.ok(typeof b === 'string' && b.length >= 10 && b.length <= 160, `beispiel 10-160 Zeichen: ${b}`)
    const a = figur.aussehen
    assert.ok(a && typeof a === 'object', 'aussehen')
    for (const k of ['haut', 'haar', 'shirt']) assert.match(a[k] ?? '', FARBE, `aussehen.${k} als #rrggbb`)
    assert.ok(FRISUREN.includes(a.frisur), `aussehen.frisur "${a.frisur}" nicht in ${FRISUREN.join(', ')}`)
  })
}

test('Namen eindeutig, Shirt-Farben paarweise verschieden', () => {
  const namen = FIGUREN.map((f) => f.figur.name)
  assert.equal(new Set(namen).size, namen.length)
  const shirts = FIGUREN.map((f) => String(f.figur.aussehen?.shirt).toLowerCase())
  assert.equal(new Set(shirts).size, shirts.length, `doppelte Shirt-Farbe: ${shirts.join(' ')}`)
})

test('KI_FIGUREN und Dateien passen zusammen; Ben ist die einzige Ausnahme', () => {
  const namen = FIGUREN.map((f) => f.figur.name)
  for (const n of KI_FIGUREN) assert.ok(namen.includes(n), `${n} steht in KI_FIGUREN, hat aber keine Datei`)
  assert.deepEqual(namen.filter((n) => !KI_FIGUREN.includes(n)), ['Ben'])
})

test('FRISUREN stimmt mit dem überein, was zeichneFigur wirklich malt', () => {
  const malen = (frisur) => {
    const aufrufe = []
    const g = { set fillStyle(v) { aufrufe.push(v) }, fillRect: (...a) => aufrufe.push(a.join(',')) }
    zeichneFigur(g, 0, 0, { haut: '#111111', haar: '#222222', frisur, shirt: '#333333' })
    return aufrufe.join('|')
  }
  const unbekannt = malen('gibt-es-nicht')
  const bilder = FRISUREN.map(malen)
  for (const [i, f] of FRISUREN.entries()) assert.notEqual(bilder[i], unbekannt, `${f} wird nicht gezeichnet`)
  assert.equal(new Set(bilder).size, FRISUREN.length, 'jede Frisur sieht anders aus')
})

test('systemPrompt: jede Figur × jede Rolle ohne {{…}}, mit harten Grenzen', () => {
  const system = fs.readFileSync(path.join(WURZEL, 'prompts', 'system.md'), 'utf8')
  const grenze = system.split('\n').find((z) => z.includes('Grenzen, die nie gebrochen werden'))
  assert.ok(grenze, 'Grenzen-Zeile in prompts/system.md')
  const namen = FIGUREN.map((f) => f.figur.name)
  for (const n of namen) {
    const figur = ladeFigur(n)
    for (const rolle of ROLLEN) {
      const p = systemPrompt(figur, rolle, namen, 'Stefan')
      const wo = `${n}/${rolle}`
      assert.doesNotMatch(p, /\{\{|\}\}/, `${wo}: übrig gebliebener Platzhalter`)
      assert.ok(p.includes(grenze.trim()), `${wo}: harte Grenzen fehlen`)
      assert.match(p, /Tinte/, wo)
      assert.match(p, /kein Blut/, wo)
      assert.match(p, /Suizid/, wo)
      assert.ok(p.includes(figur.beschreibung), `${wo}: beschreibung fehlt`)
    }
  }
})
