import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import { verteileRollen, SCHATTEN, SCHLUESSEL, SCHUELER } from '../spiel/rollen.mjs'
import { auswerten } from '../spiel/abstimmung.mjs'
import * as P from '../spiel/partie.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const ORTE = P.ORT_NAMEN

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

// Nacht fuer alle: jeder einen Platz, Schatten holt `opfer`, Schluesseltraeger prueft `pruefziel`
function nachtSpielen(p, opfer, pruefziel) {
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, ORTE[i % ORTE.length]))
  P.schattenWaehlt(p, opfer ?? P.holbar(p).find((n) => n !== k) ?? P.holbar(p)[0])
  if (P.lebt(p, k)) P.schluesselPrueft(p, pruefziel ?? p.lebende.find((n) => n !== k))
  P.morgen(p)
}
function bisZurDiskussion(startwert = 3) {
  const p = P.neuePartie(NAMEN, zufall(startwert))
  P.sprechen(p, 'Mira', 'Hallo zusammen.')
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  const opfer = NAMEN.find((n) => n !== s && n !== k)
  nachtSpielen(p, opfer, s)   // der Schluesseltraeger prueft genau den Schatten
  return { p, s, k, opfer }
}
const redenBisAbstimmung = (p) => { while (p.phase === 'diskussion') P.naechsteRunde(p) }

test('Phasen laufen Abend -> Nacht -> Morgen -> Diskussion -> Abstimmung', () => {
  const { p, opfer } = bisZurDiskussion()
  assert.equal(p.phase, 'diskussion'); assert.equal(p.nacht, 1); assert.equal(p.runde, 1)
  assert.ok(!P.lebt(p, opfer)); assert.deepEqual(p.verschwunden, [opfer])
  assert.throws(() => P.stimme(p, 'Mira', 'Jonas'), /Nicht erlaubt in Phase "diskussion"/)
  redenBisAbstimmung(p)
  assert.equal(p.phase, 'abstimmung')
  const [a, b] = p.lebende
  P.sprechen(p, a, `Ich stimme für ${b}, das passt nicht zusammen.`, b)   // Begruendung laut ist erlaubt
  assert.throws(() => P.naechsteRunde(p), /Nicht erlaubt in Phase "abstimmung"/)
})

test('Nacht: jeder braucht einen Platz, Schatten nicht sich selbst, Morgen braucht alle Entscheidungen', () => {
  const p = P.neuePartie(NAMEN, zufall(5))
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  assert.throws(() => P.schattenWaehlt(p, s), /Ungültiges Ziel/)
  assert.throws(() => P.platzWaehlen(p, 'Mira', 'Dachboden'), /Kein Ort/)
  assert.throws(() => P.morgen(p), /noch nicht gewählt/)
  P.schattenWaehlt(p, NAMEN.find((n) => n !== s && n !== k))
  assert.throws(() => P.morgen(p), /noch nicht geprüft/)
  P.schluesselPrueft(p, NAMEN.find((n) => n !== k))
  assert.throws(() => P.morgen(p), /Ohne Platz/)
})

test('Sichtbarkeit: Rollen, Platz, Nachtwahl, Pruefung, Beobachtungen und Untersuchungsergebnis privat; Funde und Gespraeche oeffentlich', () => {
  const { p, s, k, opfer } = bisZurDiskussion()
  const arten = (n) => P.verlaufFuer(p, n).map((e) => e.art)
  assert.ok(arten(s).includes('schatten-waehlt')); assert.ok(!arten(k).includes('schatten-waehlt'))
  assert.ok(arten(k).includes('pruefung')); assert.ok(!arten(s).includes('pruefung'))
  const pruef = P.verlaufFuer(p, k).find((e) => e.art === 'pruefung')
  assert.deepEqual([pruef.ziel, pruef.istSchatten], [s, true])
  for (const n of NAMEN) {
    assert.deepEqual(P.verlaufFuer(p, n).filter((e) => e.art === 'rolle').map((e) => e.name), [n])
    assert.deepEqual(P.verlaufFuer(p, n).filter((e) => e.art === 'platz').map((e) => e.wer), [n], 'nur der eigene Platz')
    for (const e of P.verlaufFuer(p, n).filter((e) => e.art === 'beobachtung')) assert.equal(e.wer, n)
  }
  assert.ok(!arten(opfer).includes('beobachtung'), 'das Opfer bekommt nichts mehr mit')
  assert.ok(p.lebende.every((n) => arten(n).includes('beobachtung')), 'alle Lebenden haben mindestens eine Beobachtung')
  assert.ok(p.ereignisse.filter((e) => e.art === 'fund').every((e) => e.sichtbar.length === NAMEN.length))
  const u = p.lebende.find((n) => n !== s)
  const text = P.untersuchen(p, u, 'Fenster')
  assert.match(text, /letzte Nacht/)
  const erg = p.ereignisse.at(-1), oeff = p.ereignisse.at(-2)
  assert.equal(erg.art, 'ergebnis'); assert.deepEqual(erg.sichtbar, [u])
  assert.equal(oeff.art, 'untersucht'); assert.deepEqual(oeff.sichtbar, p.lebende)
  assert.throws(() => P.untersuchen(p, u, 'Tür'), /heute schon untersucht/)
  assert.throws(() => P.untersuchen(p, p.lebende.find((n) => n !== u), 'Keller'), /Kein Ort/)
  assert.equal(P.untersuchungenUebrig(p, u), P.MAX_UNTERSUCHUNGEN - 1)
  // Hoechstens dreimal pro Partie: die vierte Untersuchung wird abgelehnt, egal an welchem Tag
  p.untersuchungen[u] = P.MAX_UNTERSUCHUNGEN; p.untersucht = []
  assert.equal(P.untersuchungenUebrig(p, u), 0)
  assert.throws(() => P.untersuchen(p, u, 'Tür'), /schon 3-mal untersucht/)
  const weg = p.ereignisse.find((e) => e.art === 'verschwunden')
  assert.ok(weg.text.includes(opfer) && weg.text.includes('Tintenfle'), 'Opfer-Szene nennt den Namen und bleibt bei Tinte')
  assert.equal(weg.ort, p.ereignisse.find((e) => e.art === 'platz' && e.wer === opfer).ort)
  P.sprechen(p, u, 'Wer war bei der Tür?', null)
  const letzte = p.ereignisse.at(-1)
  assert.ok(letzte.sichtbar.includes(k) && !letzte.sichtbar.includes(opfer), 'Verschwundene hören nichts mehr')
  assert.ok(P.verlaufFuer(p, opfer).some((e) => e.art === 'sagt' && e.von === 'Mira'), 'aber den Abend davor haben sie noch mitbekommen')
})

test('Sieg der Schueler: Schatten eingesperrt', () => {
  const { p, s } = bisZurDiskussion()
  redenBisAbstimmung(p)
  for (const n of p.lebende) P.stimme(p, n, n === s ? p.lebende.find((x) => x !== s) : s)
  assert.throws(() => P.abstimmungSchliessen(Object.assign({ ...p }, { stimmen: {} })), /fehlen Stimmen/)
  const st = p.ereignisse.filter((e) => e.art === 'stimme')
  assert.ok(st.every((e) => typeof e.fuer === 'string' && e.sichtbar.length === 1 && e.sichtbar[0] === e.von), 'geheime Stimme: nur der Wähler sieht seinen Zettel')
  const erg = P.abstimmungSchliessen(p)
  const aufgedeckt = p.ereignisse.find((e) => e.art === 'zettelwahl')
  assert.ok(aufgedeckt && aufgedeckt.sichtbar.length === NAMEN.length && Object.keys(aufgedeckt.stimmen).length === st.length, 'am Ende werden alle Zettel aufgedeckt')
  assert.equal(erg.eingesperrt, s)
  assert.equal(p.sieger, 'schueler'); assert.equal(p.phase, 'ende')
  assert.deepEqual(p.ereignisse.slice(-2).map((e) => e.art), ['ende', 'wahrheit'])
})

test('Sieg des Schattens: nur noch zwei im Raum', () => {
  const p = P.neuePartie(NAMEN, zufall(11))
  P.abendBeenden(p)
  const s = P.schatten(p)
  while (p.phase !== 'ende') {
    nachtSpielen(p, p.lebende.find((n) => n !== s))
    if (p.phase === 'ende') break
    redenBisAbstimmung(p)
    for (const n of p.lebende) P.stimme(p, n, null)      // alle enthalten sich
    P.abstimmungSchliessen(p)
  }
  assert.equal(p.sieger, 'schatten')
  assert.equal(p.lebende.length, 2); assert.ok(p.lebende.includes(s))
  assert.ok(p.nacht <= P.MAX_NAECHTE)
})

test('Gleichstand: niemand kommt in den Keller, es wird wieder Nacht', () => {
  const { p } = bisZurDiskussion(8)
  redenBisAbstimmung(p)
  const [a, b, c, d, e] = p.lebende
  P.stimme(p, a, b); P.stimme(p, b, a); P.stimme(p, c, null); P.stimme(p, d, null); P.stimme(p, e, null)
  const erg = P.abstimmungSchliessen(p)
  assert.equal(erg.eingesperrt, null); assert.equal(erg.gleichstand, true)
  assert.equal(p.phase, 'nacht'); assert.equal(p.nacht, 2); assert.equal(p.keller.length, 0)
})

test('Nacht 1: der Mensch ist vor dem Schatten geschützt; Vorzeigen macht ein Ergebnis öffentlich und wahr', () => {
  const p = P.neuePartie(NAMEN, zufall(21), { spieler: 'Stefan' })
  P.abendBeenden(p)
  const s = P.schatten(p)
  if (s !== 'Stefan') {
    assert.ok(!P.holbar(p).includes('Stefan') && !P.holbar(p).includes(s))
    assert.throws(() => P.schattenWaehlt(p, 'Stefan'), /Ungültiges Ziel/)
  }
  nachtSpielen(p, P.holbar(p)[0])
  if (p.phase === 'diskussion') {
    const u = p.lebende[0]
    assert.throws(() => P.vorzeigen(p, u), /nichts untersucht/)
    P.untersuchen(p, u, 'Fenster')
    const erg = P.vorzeigen(p, u)
    const b = p.ereignisse.at(-1)
    assert.equal(b.art, 'beweis'); assert.equal(b.von, u); assert.equal(b.text, erg.text); assert.deepEqual(b.sichtbar, p.lebende)
    assert.throws(() => P.vorzeigen(p, u), /schon gezeigt/)
    // in Nacht 2 ist der Mensch nicht mehr geschützt
    redenBisAbstimmung(p); for (const n of p.lebende) P.stimme(p, n, null); P.abstimmungSchliessen(p)
    if (p.phase === 'nacht' && P.lebt(p, 'Stefan') && s !== 'Stefan') assert.ok(P.holbar(p).includes('Stefan'))
  }
})

test('Spur verwischen: einmal pro Partie, keine Richtung, kein Kreidestaub; am Ende kommt die Wahrheit', () => {
  const p = P.neuePartie(NAMEN, zufall(31))
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  assert.equal(P.darfVerwischen(p), true)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, ORTE[i % ORTE.length]))
  const opfer = P.holbar(p).find((n) => n !== k)
  P.schattenWaehlt(p, opfer, true)
  assert.equal(p.verwischt, true); assert.equal(P.darfVerwischen(p), false)
  assert.equal(p.ereignisse.at(-1).verwischt, true)
  if (P.lebt(p, k)) P.schluesselPrueft(p, p.lebende.find((n) => n !== k))
  P.morgen(p)
  const funde = p.ereignisse.filter((e) => e.art === 'fund' && e.nacht === 1)
  assert.equal(funde.length, 1); assert.equal(funde[0].typ, 'spur'); assert.equal(funde[0].verwischt, true); assert.equal(funde[0].richtung, null)
  assert.match(funde[0].text, /verschmiert/)
  assert.equal(p.naechte[0].verwischt, true)
  // in der naechsten Nacht geht es nicht mehr
  if (p.phase === 'diskussion') {
    redenBisAbstimmung(p); for (const n of p.lebende) P.stimme(p, n, null); P.abstimmungSchliessen(p)
    if (p.phase === 'nacht') {
      p.lebende.forEach((n, i) => P.platzWaehlen(p, n, ORTE[i % ORTE.length]))
      assert.throws(() => P.schattenWaehlt(p, P.holbar(p)[0], true), /nur einmal/)
    }
  }
  // Wahrheit am Ende: Rollen und alle Naechte, fuer alle sichtbar
  const q = P.neuePartie(NAMEN, zufall(32))
  P.abendBeenden(q)
  const sq = P.schatten(q)
  while (q.phase !== 'ende') {
    nachtSpielen(q, q.lebende.find((n) => n !== sq))
    if (q.phase === 'ende') break
    redenBisAbstimmung(q); for (const n of q.lebende) P.stimme(q, n, null); P.abstimmungSchliessen(q)
  }
  const w = q.ereignisse.at(-1)
  assert.equal(w.art, 'wahrheit'); assert.deepEqual(w.rollen, q.rollen); assert.equal(w.naechte.length, q.nacht)
  assert.equal(w.sichtbar.length, NAMEN.length)
  assert.ok(w.naechte.every((n) => Object.keys(n.plaetze).length >= 2 && n.opfer && n.schatten === sq))
})

test('Tagesereignisse: Hausmeister = eine Runde, Glocke = offene Stimmen', () => {
  let hausmeister = 0, glocke = 0
  for (let s = 1; s <= 80 && !(hausmeister && glocke); s++) {
    const { p } = bisZurDiskussion(s)
    const ereignis = p.ereignisse.find((e) => ['hausmeister', 'glocke', 'zettel'].includes(e.art) && e.nacht === 1)
    if (ereignis?.art === 'hausmeister') {
      hausmeister++
      assert.equal(p.rundenHeute, 1)
      P.naechsteRunde(p); assert.equal(p.phase, 'abstimmung')
    }
    if (ereignis?.art === 'glocke') {
      glocke++
      redenBisAbstimmung(p)
      assert.equal(p.offeneAbstimmung, true)
      const [a, b] = p.lebende
      P.stimme(p, a, b)
      assert.deepEqual(p.ereignisse.at(-1).sichtbar, p.lebende, 'offene Stimme sehen alle sofort')
    }
  }
  assert.ok(hausmeister && glocke, 'beide Ereignisse kamen in 80 Startwerten vor')
})
