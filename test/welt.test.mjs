import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import { ORT_NAMEN, KLASSENBUCH, durchquert, beobachtungen, funde, tagesereignis, untersuchung, bei } from '../spiel/welt.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const plaetze = { Mira: 'Tür', Jonas: 'Schrank', Lea: 'Fenster', Tarik: 'Pult vorne', Nora: 'Fenster', Stefan: 'Tafel' }

test('durchquert: Orte zwischen Start und Ziel, nichts bei Nachbarn oder gleichem Ort', () => {
  assert.deepEqual(durchquert('Tür', 'Fenster'), ['Schrank', 'Tafel', 'Pult vorne', 'Pult hinten'])
  assert.deepEqual(durchquert('Fenster', 'Tafel'), ['Pult vorne', 'Pult hinten'])
  assert.deepEqual(durchquert('Tür', 'Schrank'), [])
  assert.deepEqual(durchquert('Tafel', 'Tafel'), [])
})

test('Beobachtungen: jede lebende Figur ausser dem Opfer bekommt mindestens eine wahre Zeile', () => {
  for (let s = 1; s <= 40; s++) {
    const b = beobachtungen({ plaetze, lebende: NAMEN, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(s) })
    assert.ok(!('Lea' in b))
    for (const n of NAMEN.filter((x) => x !== 'Lea')) {
      assert.ok(b[n].length >= 1, `${n} ohne Beobachtung`)
      for (const z of b[n]) {
        const m = /Du hast gesehen: (\w+) stand (.+)\./.exec(z)
        if (m) assert.equal(m[2], bei(plaetze[m[1]]), 'Gesehenes stimmt mit dem echten Platz überein')
        if (/Schritte/.test(z) && n !== 'Jonas') {
          // Jonas (Schrank, Index 1): fuer Mira (Tuer, 0) kommen Schritte von der Fensterseite, fuer alle anderen von der Tuerseite
          if (n === 'Mira') assert.match(z, /Fensterseite/); else if (plaetze[n] !== 'Schrank') assert.match(z, /Türseite/)
        }
      }
    }
    assert.ok(!b.Jonas.some((z) => /Schritte|bewegt|weg gewesen/.test(z)), 'Der Schatten hoert sich nicht selbst')
  }
})

test('Funde: Tintenspur zeigt in die richtige Richtung, Kreidestaub liegt auf dem echten Weg', () => {
  const f = funde({ plaetze, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(3) })   // Schrank(1) -> Fenster(5)
  assert.match(f[0], /vom Platz von Lea \(am Fenster\) Richtung Tür/)
  assert.ok(f[1] && ['Tafel', 'Pult vorne', 'Pult hinten'].some((o) => f[1].includes(bei(o))))
  const g = funde({ plaetze: { ...plaetze, Jonas: 'Fenster' }, schatten: 'Jonas', opfer: 'Lea', zufall: zufall(3) })
  assert.match(g[0], /endet gleich neben dem Platz von Lea/); assert.equal(g.length, 1)
})

test('Tagesereignis: Zettel luegt nie, es gibt hoechstens eines, manchmal keines', () => {
  const arten = {}
  for (let s = 1; s <= 200; s++) {
    const e = tagesereignis({ plaetze, schatten: 'Jonas', zufall: zufall(s) })
    arten[e?.art ?? 'nichts'] = (arten[e?.art ?? 'nichts'] || 0) + 1
    if (e?.art === 'zettel') assert.ok(!e.text.includes(bei('Schrank')), 'Zettel darf nicht den echten Platz des Schattens ausschliessen')
  }
  for (const a of ['zettel', 'hausmeister', 'glocke', 'nichts']) assert.ok(arten[a] > 10, `${a} kommt zu selten`)
})

test('Untersuchung: Orte nennen die echten Namen, Durchgang zeigt Tintenpunkte, Klassenbuch ist wahr', () => {
  const nacht = { plaetze, schatten: 'Jonas', opfer: 'Lea' }
  assert.equal(untersuchung({ ort: 'Fenster', ...nacht, wer: 'Mira', zufall: zufall(1) }), 'Hier standen letzte Nacht Lea und Nora.')
  assert.equal(untersuchung({ ort: 'Pult hinten', ...nacht, wer: 'Mira', zufall: zufall(1) }), 'Hier stand letzte Nacht niemand. Dazu Tintenpunkte am Boden, als wäre jemand nur durchgegangen.')
  assert.equal(untersuchung({ ort: 'Tür', ...nacht, wer: 'Jonas', zufall: zufall(1) }), 'Hier stand letzte Nacht Mira.')
  for (let s = 1; s < 20; s++) {
    const t = untersuchung({ ort: KLASSENBUCH, ...nacht, wer: 'Mira', zufall: zufall(s) })
    const m = /„(\w+) – (.+)\.“/.exec(t)
    assert.ok(m && m[1] !== 'Mira' && plaetze[m[1]] === m[2], t)
  }
  assert.equal(ORT_NAMEN.length, 6)
})
