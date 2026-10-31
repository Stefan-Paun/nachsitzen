import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import { ORTE, ORT_NAMEN, KLASSENBUCH, durchquert, beobachtungen, funde, tagesereignis, untersuchung, bei } from '../spiel/welt.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
// Jonas (Schatten) an der Tuer, Lea (Opfer) am Fenster: Weg ueber Tafel und Pulte
const plaetze = { Mira: 'Tür', Jonas: 'Tür', Lea: 'Fenster', Tarik: 'Pulte', Nora: 'Fenster', Stefan: 'Tafel' }

test('Vier Orte mit Beschreibung, durchquert liefert die Orte dazwischen', () => {
  assert.deepEqual(ORT_NAMEN, ['Tür', 'Tafel', 'Pulte', 'Fenster'])
  for (const o of ORTE) assert.ok(o.bei && o.detail.length > 20 && o.staub.length > 20)
  assert.deepEqual(durchquert('Tür', 'Fenster'), ['Tafel', 'Pulte'])
  assert.deepEqual(durchquert('Fenster', 'Tafel'), ['Pulte'])
  assert.deepEqual(durchquert('Tür', 'Tafel'), [])
  assert.deepEqual(durchquert('Pulte', 'Pulte'), [])
})

test('Beobachtungen: jede lebende Figur ausser dem Opfer bekommt mindestens eine wahre, strukturierte Zeile', () => {
  for (let s = 1; s <= 60; s++) {
    const b = beobachtungen({ plaetze, lebende: NAMEN, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(s) })
    assert.ok(!('Lea' in b))
    for (const n of NAMEN.filter((x) => x !== 'Lea')) {
      assert.ok(b[n].length >= 1, `${n} ohne Beobachtung`)
      for (const z of b[n]) {
        assert.ok(z.text && z.typ)
        if (z.typ === 'gesehen') { assert.equal(z.ort, plaetze[z.name]); assert.notEqual(z.name, n); assert.ok(z.text.includes(bei(z.ort))) }
        if (z.typ === 'bewegung') assert.equal(z.ort, 'Tür')
        if (z.typ === 'schritte') {
          // Der Schatten steht ganz links: fuer Mira (auch Tuer) "nah", fuer alle anderen von der Tuerseite
          assert.equal(z.richtung, plaetze[n] === 'Tür' ? 'nah' : 'tuer')
        }
      }
    }
    assert.ok(!b.Jonas.some((z) => z.typ !== 'gesehen'), 'Der Schatten hoert sich nicht selbst')
  }
  // Wer am selben Platz steht, wird oefter gesehen: Mira steht mit Jonas an der Tuer
  let gleich = 0, gesamt = 0
  for (let s = 1; s <= 200; s++) for (const z of beobachtungen({ plaetze, lebende: NAMEN, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(s) }).Mira) if (z.typ === 'gesehen') { gesamt++; if (z.name === 'Jonas') gleich++ }
  assert.ok(gleich / gesamt > 0.5, `Nachbar nur ${gleich}/${gesamt} gesehen`)
})

test('Funde: Tintenspur mit Richtung, Kreidestaub auf dem echten Weg, Notiz nennt die richtige Seite', () => {
  let notizen = 0
  for (let s = 1; s <= 40; s++) {
    const f = funde({ plaetze, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(s) })   // Tuer -> Fenster
    assert.equal(f[0].typ, 'spur'); assert.equal(f[0].ort, 'Fenster'); assert.equal(f[0].richtung, 'tuer'); assert.match(f[0].text, /Richtung Tür/)
    assert.equal(f[1].typ, 'staub'); assert.ok(['Tafel', 'Pulte'].includes(f[1].ort))
    const notiz = f.find((x) => x.typ === 'notiz')
    if (notiz) { notizen++; assert.equal(notiz.richtung, 'tuer'); assert.match(notiz.text, /von der Tür her/); assert.match(notiz.text, /Lea/) }
  }
  assert.ok(notizen > 5 && notizen < 35)
  const g = funde({ plaetze: { ...plaetze, Jonas: 'Fenster' }, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(3) })
  assert.equal(g[0].richtung, 'hier'); assert.ok(!g.some((x) => x.typ === 'staub'))
})

test('Tagesereignis: Zettel luegt nie und traegt den ausgeschlossenen Ort, alle Arten kommen vor', () => {
  const arten = {}
  for (let s = 1; s <= 200; s++) {
    const e = tagesereignis({ plaetze, schatten: 'Jonas', zufall: zufall(s) })
    arten[e?.art ?? 'nichts'] = (arten[e?.art ?? 'nichts'] || 0) + 1
    if (e?.art === 'zettel') { assert.notEqual(e.ort, 'Tür'); assert.ok(e.text.includes(bei(e.ort))) }
  }
  for (const a of ['zettel', 'hausmeister', 'glocke', 'nichts']) assert.ok(arten[a] > 10, `${a} kommt zu selten`)
})

test('Untersuchung: echte Namen, Durchgang, Ortsdetail; Klassenbuch ist wahr und strukturiert', () => {
  const nacht = { plaetze, schatten: 'Jonas', opfer: 'Lea' }
  const f = untersuchung({ ort: 'Fenster', ...nacht, wer: 'Mira', zufall: zufall(1) })
  assert.deepEqual([f.ort, f.namen, f.durchgang], ['Fenster', ['Lea', 'Nora'], false])
  assert.match(f.text, /^Die hohen Fenster/); assert.match(f.text, /Hier standen letzte Nacht Lea und Nora\./)
  const t = untersuchung({ ort: 'Tafel', ...nacht, wer: 'Mira', zufall: zufall(1) })
  assert.deepEqual([t.namen, t.durchgang], [['Stefan'], true]); assert.match(t.text, /Tintenpunkte/)
  for (let s = 1; s < 20; s++) {
    const k = untersuchung({ ort: KLASSENBUCH, ...nacht, wer: 'Mira', zufall: zufall(s) })
    assert.equal(k.ort, KLASSENBUCH); assert.notEqual(k.name, 'Mira'); assert.equal(k.platz, plaetze[k.name]); assert.ok(k.text.includes(`${k.name} – ${k.platz}`))
  }
})
