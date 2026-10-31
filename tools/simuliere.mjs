// Spielt ganze Partien mit Skript-Gehirnen durch (kein Netz, keine Kosten) und zaehlt,
// wer wie oft gewinnt. Aufruf: node tools/simuliere.mjs [anzahl] [startwert]
// Dieselbe Schleife treibt spaeter das echte Spiel, nur mit Claude-Gehirnen.

import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { SCHATTEN, SCHLUESSEL } from '../spiel/rollen.mjs'
import { skriptGehirn } from './skriptgehirne.mjs'

export const FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']

export function spielePartie(startwert, namen = FIGUREN) {
  const z = zufall(startwert)
  const p = P.neuePartie(namen, z)
  const gehirne = Object.fromEntries(namen.map((n) => [n, skriptGehirn(n, p.rollen[n], z)]))
  const sicht = (n) => P.verlaufFuer(p, n)

  for (const n of z.mischen(p.lebende)) P.sprechen(p, n, gehirne[n].abend(sicht(n), p.lebende).text)
  P.abendBeenden(p)

  while (p.phase !== 'ende') {
    // Nacht: Schatten und Schluesseltraeger handeln geheim
    const s = P.schatten(p), k = P.schluesseltraeger(p)
    P.schattenWaehlt(p, gehirne[s].nacht(sicht(s), p.lebende).ziel)
    if (P.lebt(p, k)) {
      const ziel = gehirne[k].nacht(sicht(k), p.lebende).ziel
      gehirne[k].merkePruefung(ziel, P.schluesselPrueft(p, ziel))
    }
    P.morgen(p)
    if (p.phase === 'ende') break

    // Diskussion: jede Runde spricht jeder einmal, Reihenfolge zufaellig
    for (let r = 0; r < P.SPRECHRUNDEN; r++) {
      for (const n of z.mischen(p.lebende)) {
        const a = gehirne[n].diskussion(sicht(n), p.lebende)
        if (a.art === 'schweigt') P.schweigen(p, n); else P.sprechen(p, n, a.text, a.an)
      }
      P.naechsteRunde(p)
    }
    for (const n of p.lebende) P.stimme(p, n, gehirne[n].abstimmung(sicht(n), p.lebende).fuer)
    P.abstimmungSchliessen(p)
  }
  return p
}

export function statistik(anzahl = 100, startwert = 1) {
  const st = { partien: anzahl, schueler: 0, schatten: 0, naechte: 0, stefanSchatten: 0, stefanSchluessel: 0, laengste: 0 }
  for (let i = 0; i < anzahl; i++) {
    const p = spielePartie(startwert + i)
    st[p.sieger] += 1
    st.naechte += p.nacht
    st.laengste = Math.max(st.laengste, p.nacht)
    if (p.rollen.Stefan === SCHATTEN) st.stefanSchatten += 1
    if (p.rollen.Stefan === SCHLUESSEL) st.stefanSchluessel += 1
  }
  st.naechteSchnitt = +(st.naechte / anzahl).toFixed(2)
  return st
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const n = Number(process.argv[2] || 100), s = Number(process.argv[3] || 1)
  const st = statistik(n, s)
  console.log(`${n} Partien (Startwert ${s})`)
  console.log(`  Schueler gewinnen: ${st.schueler} (${Math.round(100 * st.schueler / n)} %)`)
  console.log(`  Schatten gewinnt:  ${st.schatten} (${Math.round(100 * st.schatten / n)} %)`)
  console.log(`  Naechte im Schnitt: ${st.naechteSchnitt}, laengste Partie: ${st.laengste}`)
  console.log(`  Stefan war Schatten: ${st.stefanSchatten}x, Schluesseltraeger: ${st.stefanSchluessel}x`)
}
