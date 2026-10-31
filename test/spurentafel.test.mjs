import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { verlaufAlsText } from '../spiel/gehirn.mjs'
import { wissenAus, spurentafelText } from '../spiel/spurentafel.mjs'
import { behauptungAus } from '../spiel/welt.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']

// Eine Nacht mit festen Plaetzen: der Schatten holt Lea, der Schluesseltraeger prueft den Schatten
function nachNacht(startwert = 3) {
  const p = P.neuePartie(NAMEN, zufall(startwert))
  P.sprechen(p, 'Mira', 'Hallo zusammen.'); P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  const opfer = NAMEN.find((n) => n !== s && n !== k)
  for (const n of NAMEN) P.platzWaehlen(p, n, P.ORT_NAMEN[NAMEN.indexOf(n) % 4])
  P.schattenWaehlt(p, opfer); P.schluesselPrueft(p, s); P.morgen(p)
  return { p, s, k, opfer }
}

test('Spurentafel: aus der eigenen Sicht nur eigener Platz, Opfer-Platz und Spur; Behauptung wird gegen Wissen gehalten', () => {
  const { p, s, opfer } = nachNacht()
  const ich = NAMEN.find((n) => n !== s && n !== opfer)
  P.sprechen(p, ich, 'Ich war bei der Tür.', null, behauptungAus('Ich war bei der Tür.'))
  const luegner = NAMEN.find((n) => n !== s && n !== opfer && n !== ich)
  const falsch = P.ORT_NAMEN.find((o) => o !== p.naechte[0].plaetze[luegner])
  const satz = `Ich war ${falsch === 'Tür' ? 'bei der Tür' : falsch === 'Tafel' ? 'an der Tafel' : falsch === 'Pulte' ? 'bei den Pulten' : 'am Fenster'}.`
  P.sprechen(p, luegner, satz, null, behauptungAus(satz))
  const w = wissenAus(P.verlaufFuer(p, ich), ich)
  assert.equal(w.nacht, 1)
  assert.equal(w.plaetze[ich], p.naechte[0].plaetze[ich])
  assert.equal(w.plaetze[opfer], p.naechte[0].plaetze[opfer], 'die Spur verraet den Platz des Opfers')
  assert.equal(w.opfer, opfer)
  for (const [n, o] of Object.entries(w.plaetze)) assert.equal(o, p.naechte[0].plaetze[n], `Tafel behauptet nichts Falsches ueber ${n}`)
  assert.ok(!w.zeilen.some((z) => /holt|prüft/.test(z)), 'fremde Nachtwahl bleibt unsichtbar')
  const text = spurentafelText(P.verlaufFuer(p, ich), ich, p.lebende)
  assert.match(text, /Spurentafel, Nacht 1/)
  assert.match(text, new RegExp(`${opfer} weg`))
  assert.match(text, /Behauptet:/)
  assert.match(text, new RegExp(`${luegner}: .*\\((ungeprüft)\\)|${luegner}: .*⚠ war`), 'eine Luege ist ungeprueft oder fliegt auf, nie "stimmt"')
  assert.ok(!new RegExp(`${luegner}: .*✓`).test(text))
})

test('Geist und Zuschauer: fremde private Zeilen nennen den Namen, nie "Du"', () => {
  const { p, s, k, opfer } = nachNacht()
  const alle = p.ereignisse   // was ein Zuschauer oder Geist sieht
  const text = verlaufAlsText(alle, 'Stefan')
  if (s !== 'Stefan') { assert.match(text, new RegExp(`${s} schleicht zu ${opfer}`)); assert.doesNotMatch(text, /Du schleichst/) }
  if (k !== 'Stefan') assert.match(text, new RegExp(`${k} prüft ${s}: DER SCHATTEN`))
  for (const n of NAMEN.filter((n) => n !== 'Stefan')) assert.match(text, new RegExp(`${n} stellt sich`))
  assert.match(text, /Du stellst dich/)
  const w = wissenAus(alle, 'Stefan')
  assert.deepEqual(w.plaetze, p.naechte[0].plaetze, 'der Geist kennt alle Plaetze')
  assert.ok(w.zeilen.some((z) => z.includes(`holt ${opfer}`)))
  // Die eigene Sicht einer Figur enthaelt weiterhin kein fremdes Privates
  const eigene = verlaufAlsText(P.verlaufFuer(p, k), k)
  assert.match(eigene, /Du prüfst/); assert.doesNotMatch(eigene, /schleicht/)
})
