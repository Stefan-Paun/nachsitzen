import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import { verteileRollen, SCHATTEN, SCHLUESSEL, PETZE, SCHUELER, PETZE_AB } from '../spiel/rollen.mjs'
import * as P from '../spiel/partie.mjs'
import { werkzeuge } from '../spiel/gehirn.mjs'

const ALLE = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Stefan', 'Ben']   // 7 Namen = das echte Spiel
const NAMEN = ALLE.slice(0, 7)

test('Verteilung: genau eine Petze ab der Schwelle, darunter keine', () => {
  assert.equal(PETZE_AB, 7)
  for (let n = 4; n <= 8; n++) {
    for (let s = 0; s < 40; s++) {
      const r = Object.values(verteileRollen(ALLE.slice(0, n), zufall(s)))
      assert.equal(r.filter((x) => x === PETZE).length, n >= PETZE_AB ? 1 : 0, `${n} Figuren`)
      assert.equal(r.filter((x) => x === SCHATTEN).length, 1)
      assert.equal(r.filter((x) => x === SCHLUESSEL).length, 1)
      assert.equal(r.length, n)
    }
  }
})

test('Verteilung: Option erzwingt Petze an oder aus; jede Figur wird gleich oft Petze', () => {
  assert.ok(Object.values(verteileRollen(ALLE.slice(0, 4), zufall(1), { petze: true })).includes(PETZE))
  assert.ok(!Object.values(verteileRollen(NAMEN, zufall(1), { petze: false })).includes(PETZE))
  const z = {}
  for (let s = 0; s < 700; s++) { const r = verteileRollen(NAMEN, zufall(5000 + s)); z[r.Stefan] = (z[r.Stefan] || 0) + 1 }
  assert.ok(z[PETZE] > 60 && z[PETZE] < 140, `Stefan Petze ${z[PETZE]}x von 700`)
})

function bisNacht(startwert = 3, namen = NAMEN) {
  const p = P.neuePartie(namen, zufall(startwert))
  P.abendBeenden(p)
  return p
}

test('Nachtaktion: Petze erfaehrt die Rolle, kein Selbstziel, nur lebende Ziele, nur einmal pro Nacht', () => {
  const p = bisNacht()
  const x = P.petze(p), s = P.schatten(p), k = P.schluesseltraeger(p)
  assert.throws(() => P.petzePrueft(p, x), /Ungültiges Ziel/)
  assert.throws(() => P.petzePrueft(p, 'Niemand'), /Ungültiges Ziel/)
  assert.equal(P.petzePrueft(p, s), SCHATTEN)
  assert.deepEqual(p.petzeWahl, { wer: x, ziel: s, rolle: SCHATTEN })
  assert.throws(() => P.petzePrueft(p, k), /schon gewählt/)
  // Morgen geht erst, wenn die Petze gewaehlt hat
  const q = bisNacht(4)
  q.lebende.forEach((n, i) => P.platzWaehlen(q, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(q, P.holbar(q).find((n) => n !== P.schluesseltraeger(q) && n !== P.petze(q)))
  P.schluesselPrueft(q, P.schatten(q))
  assert.throws(() => P.morgen(q), /Petze hat noch nicht gewählt/)
})

test('Rhythmus: die Petze erfaehrt nur jede zweite Nacht (1, 3, ...); in den anderen Naechten ist weder Aktion noch Werkzeug da', () => {
  const p = bisNacht(8)
  const x = P.petze(p), s = P.schatten(p), k = P.schluesseltraeger(p)
  assert.equal(P.PETZE_JEDE, 2)
  assert.equal(P.petzeAktiv(p), true)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, p.lebende.find((n) => n !== s && n !== k && n !== x)); P.schluesselPrueft(p, s); P.petzePrueft(p, s); P.morgen(p)
  while (p.phase === 'diskussion') P.naechsteRunde(p)
  for (const n of p.lebende) P.stimme(p, n, null)
  P.abstimmungSchliessen(p)
  assert.equal(p.nacht, 2); assert.equal(P.petzeAktiv(p), false)
  assert.throws(() => P.petzePrueft(p, s), /setzt in dieser Nacht aus/)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, P.holbar(p).find((n) => n !== k && n !== x)); P.schluesselPrueft(p, s)
  P.morgen(p)                           // ohne Petze-Wahl moeglich
  assert.ok(P.lebt(p, x))
  assert.ok(!p.ereignisse.some((e) => e.art === 'petze-prueft' && e.nacht === 2))
  assert.deepEqual(werkzeuge('nacht', PETZE, ['Mira'], { petzeAktiv: false }).map((t) => t.name), ['verstecken'])
  const q = P.neuePartie(NAMEN, zufall(8), { petzeJede: 1 })   // Option: jede Nacht
  q.nacht = 2; assert.equal(P.petzeAktiv(q), true)
})

test('Nachtaktion: ohne Petze (5 Figuren) gibt es keine Aktion und Morgen braucht sie nicht', () => {
  const p = bisNacht(2, ALLE.slice(0, 5))
  assert.equal(P.petze(p), undefined)
  assert.throws(() => P.petzePrueft(p, 'Mira'), /keine Petze/)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, P.holbar(p).find((n) => n !== P.schluesseltraeger(p)))
  P.schluesselPrueft(p, P.schatten(p))
  P.morgen(p)
  assert.equal(p.phase, 'diskussion')
})

test('Nachtaktion: die Petze wird in der naechsten Nacht neu gefragt; eine verschwundene Petze braucht nichts mehr', () => {
  const p = bisNacht(6)
  const x = P.petze(p), s = P.schatten(p), k = P.schluesseltraeger(p)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, x)                 // der Schatten holt die Petze
  P.schluesselPrueft(p, s); P.petzePrueft(p, k)
  P.morgen(p)
  assert.ok(!P.lebt(p, x))
  while (p.phase === 'diskussion') P.naechsteRunde(p)
  for (const n of p.lebende) P.stimme(p, n, null)
  P.abstimmungSchliessen(p)
  assert.equal(p.petzeWahl, null, 'neue Nacht, neue Wahl')
  assert.throws(() => P.petzePrueft(p, k), /nicht mehr im Spiel/)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, P.holbar(p).find((n) => n !== k)); P.schluesselPrueft(p, s)
  P.morgen(p)                            // ohne Petze-Wahl moeglich
  assert.ok(p.phase === 'diskussion' || p.phase === 'ende')
})

// Alle Ausgabestellen im Partie-Modul: wer sieht das Petze-Ereignis?
test('Sichtbarkeit (Partie): das Petze-Ereignis steht nur in der Sicht der Petze', () => {
  const p = bisNacht(3)
  const x = P.petze(p), s = P.schatten(p), k = P.schluesseltraeger(p)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, p.lebende.find((n) => n !== s && n !== k && n !== x))
  P.schluesselPrueft(p, x)
  P.petzePrueft(p, s)
  P.morgen(p)
  const e = p.ereignisse.find((e) => e.art === 'petze-prueft')
  assert.deepEqual(e.sichtbar, [x])
  for (const n of NAMEN.filter((n) => n !== x)) {
    assert.ok(!P.verlaufFuer(p, n).some((e) => e.art === 'petze-prueft'), `${n} sieht die Petze-Wahl nicht`)
    // auch nicht indirekt: kein anderes sichtbares Ereignis nennt die Rolle des Geprueften
    assert.ok(!JSON.stringify(P.verlaufFuer(p, n).filter((e) => e.art !== 'rolle' && e.art !== 'wahrheit')).includes('"petze-prueft"'))
  }
  assert.ok(P.verlaufFuer(p, x).some((e) => e.art === 'petze-prueft' && e.ziel === s && e.rolle === SCHATTEN))
  // Zusammenfassung (Hefte, Anzeige) verraet nichts ueber die Wahl
  assert.ok(!JSON.stringify(P.zusammenfassung(p)).includes('petze'))
})

// --- Sichtbarkeit an allen Stellen, die Text an ein Gehirn oder den Browser geben ----------

import { claudeGehirn, ladeFigur, verlaufAlsText, systemPrompt } from '../spiel/gehirn.mjs'
import { spieleBisZumEnde } from '../spiel/schleife.mjs'
import { spurentafelText } from '../spiel/spurentafel.mjs'
import { erstelleServer, KI_FIGUREN } from '../server.mjs'
import { skriptGehirn } from '../tools/skriptgehirne.mjs'

const MERKMAL = /(erfährt|erfährst) von \S+: (der|die|ein)/   // so sieht jede Petze-Zeile im Verlauf aus (der Regeltext im Prompt passt nicht darauf)

// Erfundene Antworten fuer jedes Werkzeug (kein Netz): erste erlaubte Option, sonst harmlose Werte
function fakeAnfrage(req) {
  const t = req.tools[0]
  const eingabe = {}
  for (const [k, v] of Object.entries(t.input_schema.properties)) {
    if (v.enum) eingabe[k] = v.enum[0]
    else if (v.anyOf) eingabe[k] = null
    else if (v.type === 'boolean') eingabe[k] = false
    else if (v.type === 'array') eingabe[k] = []
    else eingabe[k] = 'Hallo.'
  }
  return Promise.resolve({ werkzeug: { name: t.name, eingabe } })
}

test('Sichtbarkeit (Gehirn): kein Text an ein fremdes Claude-Gehirn nennt die Wahl der Petze; die Petze sieht sie', async () => {
  for (const startwert of [1, 2, 3, 4]) {
    const z = zufall(startwert)
    const p = P.neuePartie(NAMEN, z)
    const x = P.petze(p)
    const gesehen = Object.fromEntries(NAMEN.map((n) => [n, []]))
    const gehirne = {}
    for (const n of NAMEN) {
      const anfrage = (req) => { gesehen[n].push(req.system, req.nachricht, JSON.stringify(req.tools)); return fakeAnfrage(req) }
      gehirne[n] = claudeGehirn(ladeFigur(n === 'Stefan' ? 'Mira' : n), p.rollen[n], { anfrage, mitspieler: NAMEN, zufall: z })
      gehirne[n].name = n
    }
    await spieleBisZumEnde(p, gehirne, { zufall: z })
    for (const n of NAMEN) {
      const sicht = verlaufAlsText(P.verlaufFuer(p, n), n)
      const heft = await gehirne[n].heftSchreiben(P.verlaufFuer(p, n), P.zusammenfassung(p))
      assert.ok(heft && typeof heft.eintrag === 'string')
      const alles = gesehen[n].join('\n')
      if (n === x) { assert.match(sicht, MERKMAL) }   // (ob ein spaeterer Prompt es enthaelt, haengt davon ab, ob die Petze die Nacht uebersteht)
      else {
        assert.doesNotMatch(sicht, MERKMAL, `${n} (Seed ${startwert}): Verlauf`)
        assert.doesNotMatch(alles, MERKMAL, `${n} (Seed ${startwert}): Prompt, Nachrichten, Heft-Anfrage`)
        assert.ok(!alles.includes('erfragen'), 'Werkzeug der Petze nur fuer die Petze')
      }
    }
  }
})

test('Sichtbarkeit (Werkzeuge und Prompts): Petze-Werkzeug nur fuer die Petze, Rollentext nur der eigene', () => {
  const namen = ['Mira', 'Lea']
  assert.deepEqual(werkzeuge('nacht', PETZE, namen).map((t) => t.name), ['erfragen'])
  for (const r of [SCHATTEN, SCHLUESSEL, SCHUELER]) assert.ok(!werkzeuge('nacht', r, namen).some((t) => t.name === 'erfragen'))
  assert.ok(!werkzeuge('nacht', PETZE, namen)[0].input_schema.properties.ziel.enum.includes('Sam'))
  const s = systemPrompt(ladeFigur('Nora'), SCHUELER, NAMEN, 'Stefan')
  assert.ok(!s.includes('Du bist die Petze'))
  assert.ok(systemPrompt(ladeFigur('Nora'), PETZE, NAMEN, 'Stefan').includes('Du bist die Petze'))
  assert.ok(werkzeuge('nacht', PETZE, ['Mira'])[0].strict)
})

test('Sichtbarkeit (Spurentafel): Tafel der anderen zeigt nichts von der Petze-Wahl; Zuschauer und Geist sehen sie mit Namen', () => {
  const p = bisNacht(3)
  const x = P.petze(p), s = P.schatten(p), k = P.schluesseltraeger(p)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % 4]))
  P.schattenWaehlt(p, p.lebende.find((n) => n !== s && n !== k && n !== x))
  P.schluesselPrueft(p, x); P.petzePrueft(p, s); P.morgen(p)
  for (const n of p.lebende.filter((n) => n !== x)) assert.doesNotMatch(spurentafelText(P.verlaufFuer(p, n), n, p.lebende), MERKMAL, n)
  assert.match(spurentafelText(P.verlaufFuer(p, x), x, p.lebende), /Du erfährst von .*: der Schatten/)
  assert.match(spurentafelText(p.ereignisse, '', p.lebende), new RegExp(`${x} erfährt von ${s}: der Schatten`))
})

test('Sichtbarkeit (Ende): Die Wahrheit am Ende nennt Rollen und Naechte, aber keine Petze-Wahl', async () => {
  const p = await (await import('../tools/simuliere.mjs')).spielePartie(11)
  const w = p.ereignisse.find((e) => e.art === 'wahrheit')
  assert.ok(w)
  assert.ok(!JSON.stringify(w).includes('petze-prueft'))
  assert.deepEqual(Object.keys(w).sort(), ['art', 'naechte', 'nacht', 'phase', 'nr', 'rollen', 'sichtbar'].sort())
  for (const n of w.naechte) assert.deepEqual(Object.keys(n).sort(), ['nacht', 'opfer', 'plaetze', 'schatten', 'verwischt'])
  assert.ok(!JSON.stringify(P.zusammenfassung(p)).includes('petze'))
})

// Server: was der Browser bekommt (SSE und /verlauf)
const sw = (wunsch) => { for (let s = 1; s < 500; s++) { const r = verteileRollen([...KI_FIGUREN, 'Stefan'], zufall(s)); if (wunsch(r)) return s } throw new Error('kein Startwert') }

async function spielerPartie(startwert, aktion) {
  const s = erstelleServer({ gehirnFabrik: (n, r, { zufall: z }) => skriptGehirn(n, r, z), port: 0, pause: 0, startwert })
  const port = await s.starten()
  try {
    const kopf = await (await fetch(`http://127.0.0.1:${port}/partie`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Stefan' }) })).json()
    let ende = false
    const t0 = Date.now()
    let ab = 0, alle = []
    while (!ende && Date.now() - t0 < 15000) {
      const v = await (await fetch(`http://127.0.0.1:${port}/verlauf?ab=${ab}`)).json()
      for (const e of v.ereignisse) { alle.push(e); ab = e.nr + 1 }
      const w = v.status.warte
      if (w) await aktion(port, w)
      ende = v.status.phase === 'ende'
      await new Promise((f) => setTimeout(f, 5))
    }
    return { kopf, alle, status: await (await fetch(`http://127.0.0.1:${port}/status`)).json() }
  } finally { await s.schliessen() }
}
const antwort = (port, a) => fetch(`http://127.0.0.1:${port}/aktion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) })
const mensch = async (port, w) => {
  if (w.art === 'sagen') await antwort(port, { art: 'sagt', text: 'Hallo.', an: null })
  else if (w.art === 'stimme') await antwort(port, { fuer: null })
  else if (w.art === 'nacht') await antwort(port, { platz: w.orte[0], ziel: w.optionen?.[0] })
  else if (w.art === 'untersuchen') await antwort(port, { ort: null })
  else if (w.art === 'zeigen') await antwort(port, { zeigen: false })
}

test('Sichtbarkeit (Server/Browser): ein Mensch ohne Petze-Rolle merkt von der Petze nichts', async () => {
  const startwert = sw((r) => r.Stefan === SCHUELER)
  const { kopf, alle } = await spielerPartie(startwert, mensch)
  assert.equal(kopf.rolle, SCHUELER)
  const raus = alle.findIndex((e) => (e.art === 'verschwunden' || e.art === 'eingesperrt') && e.name === 'Stefan')
  const davor = raus < 0 ? alle : alle.slice(0, raus)   // danach ist er Geist und sieht alles
  assert.ok(davor.length > 5)
  assert.ok(!davor.some((e) => e.art === 'petze-prueft'))
  assert.ok(!JSON.stringify(davor).includes('petze-prueft'))
  assert.ok(!('sichtbar' in alle[0]))
})

test('Sichtbarkeit (Server/Browser): der Mensch als Petze waehlt in der Nacht und sieht nur sein Ergebnis', async () => {
  const startwert = sw((r) => r.Stefan === PETZE)
  let aufgabe = null
  const { kopf, alle } = await spielerPartie(startwert, async (port, w) => { if (w.art === 'nacht') aufgabe = aufgabe ?? w.aufgabe; await mensch(port, w) })
  assert.equal(kopf.rolle, PETZE)
  assert.equal(aufgabe, 'erfragen')
  const eigene = alle.filter((e) => e.art === 'petze-prueft')
  assert.ok(eigene.length >= 1)
  assert.ok(eigene.every((e) => e.wer === 'Stefan' || alle.indexOf(e) > alle.findIndex((x) => (x.art === 'verschwunden' || x.art === 'eingesperrt') && x.name === 'Stefan')), 'fremde Wahl nur als Geist')
})

test('Browser-Gehirn: Petze-Aufgabe heisst erfragen und braucht ein Ziel', async () => {
  const { browserGehirn } = await import('../spiel/browsergehirn.mjs')
  const g = browserGehirn('Stefan', PETZE, { sende: () => {} })
  const f = g.nacht([], NAMEN, { orte: P.ORT_NAMEN, ziele: ['Mira', 'Lea'] })
  assert.equal(g.wartetAuf().aufgabe, 'erfragen')
  assert.match(g.aktion({ platz: 'Tür' }), /von wem du die Rolle erfahren willst/)
  assert.match(g.aktion({ platz: 'Tür', ziel: 'Sam' }), /nicht erfragen/)
  assert.equal(g.aktion({ platz: 'Tür', ziel: 'Mira' }), null)
  assert.deepEqual(await f, { platz: 'Tür', ziel: 'Mira', verwischen: false })
})

// --- Balance (fester Startwert, Skript-Gehirne) ---------------------------------------------

import { statistik } from '../tools/simuliere.mjs'

test('Balance: mit Petze (7 Figuren, jede zweite Nacht) gewinnt der Schatten in 40 bis 60 Prozent', async () => {
  const st = await statistik(2000, 1, ALLE.slice(0, 7))
  const q = 100 * st.schatten / st.partien
  assert.equal(st.partien, 2000); assert.equal(st.schatten + st.schueler, 2000)
  assert.ok(q >= 40 && q <= 60, `Schatten-Quote ${q} %`)
})

test('Balance: ohne Petze bei 4 und 6 Figuren im Ziel; die Petze selbst senkt die Schattenquote spuerbar', async () => {
  for (const n of [4, 6]) {
    const st = await statistik(2000, 1, ALLE.slice(0, n), { petze: false })
    const q = 100 * st.schatten / st.partien
    assert.ok(q >= 40 && q <= 60, `${n} Figuren ohne Petze: ${q} %`)
  }
  const ohne = await statistik(2000, 1, ALLE.slice(0, 7), { petze: false })
  const mit = await statistik(2000, 1, ALLE.slice(0, 7), { petze: true, petzeJede: 1 })
  assert.ok(mit.schatten < ohne.schatten, 'Petze hilft den Schuelern')
})

test('Balance: dieselbe Messung zweimal gibt dasselbe Ergebnis (fester Startwert)', async () => {
  const a = await statistik(200, 7, ALLE.slice(0, 7)), b = await statistik(200, 7, ALLE.slice(0, 7))
  assert.deepEqual(a, b)
})

test('Skript-Petze: prueft Verdaechtige zuerst und sagt einen gefundenen Schatten an; der Schatten gibt sich als Petze aus', () => {
  const z = zufall(1)
  const g = skriptGehirn('Lea', PETZE, z)
  const sicht = [{ art: 'sagt', von: 'Mira', an: 'Tarik', text: 'Tarik, du warst nicht an deinem Platz.' }]
  const n = g.nacht(sicht, ['Mira', 'Jonas', 'Lea', 'Tarik'], { orte: P.ORT_NAMEN, petzeAktiv: true })
  assert.equal(n.ziel, 'Tarik', 'der Beschuldigte zuerst')
  g.merkePetze('Tarik', SCHATTEN)
  const d = g.diskussion([], ['Mira', 'Jonas', 'Lea', 'Tarik'])
  assert.match(d.text, /Ich bin die Petze.*Tarik ist der Schatten/); assert.equal(d.an, 'Tarik')
  assert.deepEqual(g.abstimmung([], ['Mira', 'Lea', 'Tarik']), { fuer: 'Tarik' })
  const h = skriptGehirn('Lea', PETZE, zufall(2))
  assert.ok(!('ziel' in h.nacht([], ['Mira', 'Lea'], { orte: P.ORT_NAMEN, petzeAktiv: false })), 'ausgesetzte Nacht: kein Ziel')
  // Schatten: gibt sich manchmal als Petze aus (nur wenn es eine gibt), nie ohne
  const gaben = (mit) => { let c = 0; for (let i = 1; i <= 300; i++) { const s = skriptGehirn('Sam', SCHATTEN, zufall(i), { mitPetze: mit }); const a = s.diskussion([], ['Mira', 'Sam', 'Tarik']); if (a.text?.startsWith('Ich bin die Petze')) c++ } return c }
  assert.ok(gaben(true) > 5); assert.equal(gaben(false), 0)
  // und er holt, wer ihn als Schatten angesagt hat
  const sch = skriptGehirn('Sam', SCHATTEN, zufall(3))
  const sagt = [{ art: 'sagt', von: 'Nora', an: 'Sam', text: 'Ich bin die Petze, ich habe Sam nachts durchschaut: Sam ist der Schatten.' }, { art: 'sagt', von: 'Mira', an: null, text: 'Blabla' }, { art: 'sagt', von: 'Mira', an: null, text: 'Mehr Blabla' }]
  assert.equal(sch.nacht(sagt, ['Mira', 'Nora', 'Sam'], { orte: P.ORT_NAMEN, ziele: ['Mira', 'Nora'] }).ziel, 'Nora')
})
