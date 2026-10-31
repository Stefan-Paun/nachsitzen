import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import { verteileRollen, SCHATTEN, SCHLUESSEL, SCHUELER } from '../spiel/rollen.mjs'
import { auswerten } from '../spiel/abstimmung.mjs'
import * as P from '../spiel/partie.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']

test('Zufall ist mit gleichem Startwert reproduzierbar', () => {
  const a = zufall(42), b = zufall(42)
  assert.deepEqual([a.zahl(), a.bis(10), a.aus(NAMEN)], [b.zahl(), b.bis(10), b.aus(NAMEN)])
  assert.deepEqual(zufall(7).mischen(NAMEN).sort(), [...NAMEN].sort())
})

test('Rollen: genau ein Schatten, ein Schluesseltraeger, Rest Schueler', () => {
  for (let s = 0; s < 50; s++) {
    const r = Object.values(verteileRollen(NAMEN, zufall(s)))
    assert.equal(r.filter((x) => x === SCHATTEN).length, 1)
    assert.equal(r.filter((x) => x === SCHLUESSEL).length, 1)
    assert.equal(r.filter((x) => x === SCHUELER).length, 4)
  }
  assert.throws(() => verteileRollen(['A', 'A', 'B', 'C'], zufall(1)), /eindeutig/)
  assert.throws(() => verteileRollen(['A', 'B', 'C'], zufall(1)), /Mindestens 4/)
})

test('Jede Figur bekommt jede Rolle etwa gleich oft', () => {
  const z = {}
  for (let s = 0; s < 600; s++) { const r = verteileRollen(NAMEN, zufall(1000 + s)); z[r.Stefan] = (z[r.Stefan] || 0) + 1 }
  assert.ok(z[SCHATTEN] > 60 && z[SCHATTEN] < 140, `Stefan Schatten ${z[SCHATTEN]}x von 600`)
})

test('Abstimmung: Mehrheit sperrt ein, Gleichstand niemanden, Enthaltung zaehlt nicht', () => {
  const l = ['A', 'B', 'C', 'D']
  assert.equal(auswerten({ A: 'B', B: 'A', C: 'B', D: null }, l).eingesperrt, 'B')
  const g = auswerten({ A: 'B', B: 'A', C: null, D: null }, l)
  assert.equal(g.eingesperrt, null); assert.equal(g.gleichstand, true)
  assert.equal(auswerten({ A: null, B: null, C: null, D: null }, l).eingesperrt, null)
  assert.throws(() => auswerten({ A: 'A' }, l), /selbst/)
  assert.throws(() => auswerten({ A: 'X' }, l), /nicht im Raum/)
})

function bisZurDiskussion(startwert = 3) {
  const p = P.neuePartie(NAMEN, zufall(startwert))
  P.sprechen(p, 'Mira', 'Hallo zusammen.')
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  const opfer = NAMEN.find((n) => n !== s && n !== k)
  P.schattenWaehlt(p, opfer)
  P.schluesselPrueft(p, s)   // der Schluesseltraeger prueft zufaellig genau den Schatten
  P.morgen(p)
  return { p, s, k, opfer }
}

test('Phasen laufen Abend -> Nacht -> Morgen -> Diskussion -> Abstimmung', () => {
  const { p, opfer } = bisZurDiskussion()
  assert.equal(p.phase, 'diskussion'); assert.equal(p.nacht, 1)
  assert.ok(!P.lebt(p, opfer)); assert.deepEqual(p.verschwunden, [opfer])
  assert.throws(() => P.stimme(p, 'Mira', 'Jonas'), /Nicht erlaubt in Phase "diskussion"/)
  for (let r = 0; r < P.SPRECHRUNDEN; r++) P.naechsteRunde(p)
  assert.equal(p.phase, 'abstimmung')
})

test('Nacht: Schatten darf sich nicht selbst waehlen, Morgen braucht beide Entscheidungen', () => {
  const p = P.neuePartie(NAMEN, zufall(5))
  P.abendBeenden(p)
  const s = P.schatten(p)
  assert.throws(() => P.schattenWaehlt(p, s), /Ungueltiges Ziel/)
  assert.throws(() => P.morgen(p), /noch nicht gewaehlt/)
  P.schattenWaehlt(p, NAMEN.find((n) => n !== s && n !== P.schluesseltraeger(p)))
  assert.throws(() => P.morgen(p), /noch nicht geprueft/)
})

test('Sichtbarkeit: Rollen, Nachtwahl und Pruefung bleiben privat; Gespraeche sehen alle Lebenden', () => {
  const { p, s, k, opfer } = bisZurDiskussion()
  const arten = (n) => P.verlaufFuer(p, n).map((e) => e.art)
  assert.ok(arten(s).includes('schatten-waehlt'))
  assert.ok(!arten(k).includes('schatten-waehlt'))
  assert.ok(arten(k).includes('pruefung'))
  assert.ok(!arten(s).includes('pruefung'))
  const pruef = P.verlaufFuer(p, k).find((e) => e.art === 'pruefung')
  assert.deepEqual([pruef.ziel, pruef.istSchatten], [s, true])
  for (const n of NAMEN) {
    const rollen = P.verlaufFuer(p, n).filter((e) => e.art === 'rolle')
    assert.equal(rollen.length, 1); assert.equal(rollen[0].name, n)
  }
  P.sprechen(p, 'Nora', 'Wer war bei der Tuer?', null)
  const letzte = p.ereignisse.at(-1)
  assert.equal(letzte.art, 'sagt')
  assert.ok(letzte.fuer.includes(k))
  assert.ok(!letzte.fuer.includes(opfer), 'Verschwundene hoeren nichts mehr')
  assert.ok(P.verlaufFuer(p, opfer).some((e) => e.art === 'sagt' && e.von === 'Mira'), 'aber den Abend davor haben sie noch mitbekommen')
})

test('Sieg der Schueler: Schatten eingesperrt', () => {
  const { p, s } = bisZurDiskussion()
  for (let r = 0; r < P.SPRECHRUNDEN; r++) P.naechsteRunde(p)
  for (const n of p.lebende) P.stimme(p, n, n === s ? p.lebende.find((x) => x !== s) : s)
  assert.throws(() => P.abstimmungSchliessen(Object.assign({ ...p }, { stimmen: {} })), /fehlen Stimmen/)
  const erg = P.abstimmungSchliessen(p)
  assert.equal(erg.eingesperrt, s)
  assert.equal(p.sieger, 'schueler'); assert.equal(p.phase, 'ende')
  assert.equal(p.ereignisse.at(-1).art, 'ende')
})

test('Sieg des Schattens: nur noch zwei im Raum', () => {
  const p = P.neuePartie(NAMEN, zufall(11))
  P.abendBeenden(p)
  const s = P.schatten(p)
  while (p.phase !== 'ende') {
    const k = P.schluesseltraeger(p)
    const ziel = p.lebende.find((n) => n !== s)
    P.schattenWaehlt(p, ziel)
    if (P.lebt(p, k)) P.schluesselPrueft(p, p.lebende.find((n) => n !== k))
    P.morgen(p)
    if (p.phase === 'ende') break
    for (let r = 0; r < P.SPRECHRUNDEN; r++) P.naechsteRunde(p)
    for (const n of p.lebende) P.stimme(p, n, null)      // alle enthalten sich
    P.abstimmungSchliessen(p)
  }
  assert.equal(p.sieger, 'schatten')
  assert.equal(p.lebende.length, 2); assert.ok(p.lebende.includes(s))
  assert.ok(p.nacht <= P.MAX_NAECHTE)
})

test('Gleichstand: niemand kommt in den Keller, es wird wieder Nacht', () => {
  const { p } = bisZurDiskussion(8)
  for (let r = 0; r < P.SPRECHRUNDEN; r++) P.naechsteRunde(p)
  const [a, b, c, d, e] = p.lebende
  P.stimme(p, a, b); P.stimme(p, b, a); P.stimme(p, c, null); P.stimme(p, d, null); P.stimme(p, e, null)
  const erg = P.abstimmungSchliessen(p)
  assert.equal(erg.eingesperrt, null); assert.equal(erg.gleichstand, true)
  assert.equal(p.phase, 'nacht'); assert.equal(p.nacht, 2); assert.equal(p.keller.length, 0)
})
