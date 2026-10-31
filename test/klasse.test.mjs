import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layout, ZONEN, PULTE, B, H, waehleSchreck, SCHRECKEN } from '../public/klasse.js'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const basis = { namen: NAMEN, lebende: NAMEN, verschwunden: [], keller: [], spieler: 'Stefan', plaetze: {}, opfer: null }

test('Tag: jede lebende Figur sitzt an ihrem Pult, Verschwundene hinterlassen ein leeres Pult', () => {
  const l = layout({ ...basis, phase: 'diskussion', lebende: NAMEN.filter((n) => n !== 'Lea' && n !== 'Nora'), verschwunden: ['Lea'], keller: ['Nora'] })
  assert.equal(l.nacht, false)
  assert.deepEqual(l.figuren.map((f) => f.name).sort(), ['Jonas', 'Mira', 'Stefan', 'Tarik'])
  assert.ok(l.figuren.every((f) => f.modus === 'sitzt' && f.x >= 0 && f.x + 12 <= B && f.y >= 0 && f.y + 14 <= H))
  assert.deepEqual(l.leerePulte, [2])          // Lea hatte Pult 2
  assert.equal(l.imKeller, 1)
  assert.deepEqual(l.unbekannt, [])
})

test('Nacht: nur Figuren mit bekanntem Platz, nebeneinander am selben Ort, Rest unbekannt', () => {
  const l = layout({ ...basis, phase: 'nacht', plaetze: { Stefan: 'Fenster', Mira: 'Fenster', Jonas: 'Tür' } })
  assert.equal(l.nacht, true)
  assert.deepEqual(l.figuren.map((f) => f.name).sort(), ['Jonas', 'Mira', 'Stefan'])
  const amFenster = l.figuren.filter((f) => f.ort === 'Fenster').sort((a, b) => a.x - b.x)
  assert.equal(amFenster.length, 2); assert.equal(amFenster[1].x - amFenster[0].x, 16)
  assert.equal(Math.round((amFenster[0].x + amFenster[1].x + 12) / 2), ZONEN.Fenster.x)
  assert.deepEqual(l.unbekannt, ['Lea', 'Tarik', 'Nora'])
  assert.ok(l.figuren.every((f) => f.x >= 0 && f.x + 12 <= B))
})

test('Morgen zaehlt noch als Nacht-Bild; eigene Pultzuordnung wird respektiert', () => {
  const l = layout({ ...basis, phase: 'morgen', plaetze: { Stefan: 'Pulte' } })
  assert.equal(l.nacht, true); assert.equal(l.figuren[0].ort, 'Pulte')
  const t = layout({ ...basis, phase: 'abend', pulte: { Stefan: 0, Mira: 5 } })
  const st = t.figuren.find((f) => f.name === 'Stefan'), mi = t.figuren.find((f) => f.name === 'Mira')
  assert.equal(st.x, PULTE[0][0] + 6); assert.equal(mi.x, PULTE[5][0] + 6)
})

test('Schrecken: nie zweimal derselbe, nie wenn alle verbraucht, nur mit Wahrscheinlichkeit', () => {
  assert.equal(waehleSchreck(SCHRECKEN, () => 0), null)
  assert.equal(waehleSchreck([], () => 0.9), null)
  const a = waehleSchreck([], () => 0); assert.ok(SCHRECKEN.includes(a))
  const b = waehleSchreck([a], () => 0); assert.ok(b && b !== a)
  const c = waehleSchreck([a, b], () => 0); assert.ok(c && c !== a && c !== b)
})
