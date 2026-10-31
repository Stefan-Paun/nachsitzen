// Spurentafel als Text, fuer das Terminal (tools/spiele.mjs) und fuer Agenten (tools/zug.mjs).
// Dieselbe Logik wie die Tafel im Browser (public/app.js, merke/zeigeTafel): Aus den sichtbaren
// Ereignissen der letzten Nacht wird gesammelt, was sicher ist, und gegen die Behauptungen gehalten.

import { ORT_NAMEN, KLASSENBUCH, bei } from './welt.mjs'

const RICHTUNG = { tuer: 'von der Türseite', fenster: 'von der Fensterseite', hier: 'von nebenan' }

// ereignisse: nur die, die `ich` sehen darf. Liefert das Wissen ueber die letzte Nacht.
export function wissenAus(ereignisse, ich) {
  let w = leer(0)
  for (const e of ereignisse) {
    if (e.art === 'nacht') { w = leer(e.nacht); continue }
    switch (e.art) {
      case 'platz': w.plaetze[e.wer] = e.ort; break
      case 'beobachtung':
        if (e.typ === 'gesehen') w.plaetze[e.name] = e.ort
        if (e.typ === 'gesehen-alle') for (const n of e.namen || []) w.plaetze[n] = e.ort
        if (e.durchgang) w.durchgang.add(e.ort)
        w.zeilen.push(e.wer === ich ? e.text : `${e.wer}: ${e.text}`); break
      case 'schatten-waehlt': w.zeilen.push(`${e.wer === ich ? 'Du holst' : `${e.wer} holt`} ${e.ziel}.`); break
      case 'pruefung': w.zeilen.push(`${e.wer === ich ? 'Du prüfst' : `${e.wer} prüft`} ${e.ziel}: ${e.istSchatten ? 'DER SCHATTEN' : 'kein Schatten'}.`); break
      case 'verschwunden': w.opfer = e.name; if (e.ort) w.plaetze[e.name] = e.ort; break
      case 'fund':
        w.funde.push(e.text)
        if (e.typ === 'spur') { w.spur = { ort: e.ort, richtung: e.richtung }; if (w.opfer) w.plaetze[w.opfer] = e.ort }
        if (e.typ === 'staub') w.staub.add(e.ort)
        break
      case 'zettel': w.zettel = e.ort; w.funde.push(`Zettel: ${e.text}`); break
      case 'hausmeister': case 'glocke': w.funde.push(e.text); break
      case 'ergebnis':
        if (e.ort === KLASSENBUCH) { if (e.name && e.platz) w.plaetze[e.name] = e.platz }
        else { for (const n of e.namen || []) w.plaetze[n] = e.ort; if (e.durchgang) w.durchgang.add(e.ort) }
        w.zeilen.push(`${e.wer === ich ? 'Du' : e.wer} (Untersuchung): ${e.text}`); break
      case 'beweis':
        if (e.ort === KLASSENBUCH) { const m = /„(\w+) – (.+)\.“/.exec(e.text); if (m) w.plaetze[m[1]] = m[2] }
        else { const m = /Hier standen? letzte Nacht (.+?)\./.exec(e.text); if (m && !/niemand/.test(m[1])) for (const n of m[1].split(' und ')) w.plaetze[n] = e.ort; if (/Tintenpunkte/.test(e.text)) w.durchgang.add(e.ort) }
        w.funde.push(`Beweis (${e.von === ich ? 'du' : e.von}): ${e.text}`); break
      case 'sagt': if (e.behauptet && e.nacht === w.nacht) w.behauptet[e.von] = e.behauptet; break
      default: break
    }
  }
  return w
}

function leer(nacht) { return { nacht, plaetze: {}, behauptet: {}, zettel: null, spur: null, staub: new Set(), durchgang: new Set(), zeilen: [], funde: [], opfer: null } }

// Die Tafel als Text. lebende: wer noch im Raum ist (fuer "Platz unbekannt").
export function spurentafelText(ereignisse, ich, lebende = []) {
  const w = wissenAus(ereignisse, ich)
  if (!w.nacht) return 'Spurentafel: noch keine Nacht.'
  const z = [`── Spurentafel, Nacht ${w.nacht} ──`]
  for (const o of ORT_NAMEN) {
    const wer = Object.entries(w.plaetze).filter(([, ort]) => ort === o).map(([n]) => (n === ich ? 'du' : n))
    const marken = []
    if (w.opfer && w.plaetze[w.opfer] === o) marken.push(`${w.opfer} weg`)
    if (w.spur?.ort === o) marken.push(w.spur.richtung ? `Tinte ${RICHTUNG[w.spur.richtung] || w.spur.richtung}` : 'Tinte verwischt')
    if (w.staub.has(o) || w.durchgang.has(o)) marken.push('Durchgang')
    if (w.zettel === o) marken.push('kein Schatten')
    z.push(`  ${o.padEnd(8)} ${(wer.join(', ') || '–').padEnd(28)} ${marken.join(' · ')}`.trimEnd())
  }
  const unbekannt = lebende.filter((n) => !(n in w.plaetze)).map((n) => (n === ich ? 'du' : n))
  z.push(unbekannt.length ? `  Platz unbekannt: ${unbekannt.join(', ')}` : '  Alle Plätze bekannt.')
  if (w.zeilen.length) { z.push('  Was ich weiß:'); for (const t of w.zeilen) z.push(`   · ${t}`) }
  if (w.funde.length) { z.push('  Funde:'); for (const t of w.funde) z.push(`   · ${t}`) }
  const namen = Object.keys(w.behauptet)
  if (namen.length) {
    z.push('  Behauptet:')
    for (const n of namen) {
      const b = w.behauptet[n], ist = w.plaetze[n]
      z.push(`   · ${n === ich ? 'du' : n}: ${bei(b)} ${ist && ist !== b ? `⚠ war ${bei(ist)}` : ist ? '✓ stimmt' : '(ungeprüft)'}`)
    }
  }
  return z.join('\n')
}
