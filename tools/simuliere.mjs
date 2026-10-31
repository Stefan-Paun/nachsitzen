// Spielt ganze Partien mit Skript-Gehirnen durch (kein Netz, keine Kosten) und zaehlt,
// wer wie oft gewinnt. Aufruf: node tools/simuliere.mjs [anzahl] [startwert]
// Dieselbe Schleife (spiel/schleife.mjs) treibt das echte Spiel mit Claude-Gehirnen.

import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { spieleBisZumEnde } from '../spiel/schleife.mjs'
import { SCHATTEN, SCHLUESSEL } from '../spiel/rollen.mjs'
import { skriptGehirn } from './skriptgehirne.mjs'

export const FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Stefan']

export async function spielePartie(startwert, namen = FIGUREN) {
  const z = zufall(startwert)
  const p = P.neuePartie(namen, z)
  const gehirne = Object.fromEntries(namen.map((n) => [n, skriptGehirn(n, p.rollen[n], z)]))
  return spieleBisZumEnde(p, gehirne, { zufall: z })
}

export async function statistik(anzahl = 100, startwert = 1) {
  const st = { partien: anzahl, schueler: 0, schatten: 0, naechte: 0, stefanSchatten: 0, stefanSchluessel: 0, laengste: 0 }
  for (let i = 0; i < anzahl; i++) {
    const p = await spielePartie(startwert + i)
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
  const st = await statistik(n, s)
  console.log(`${n} Partien (Startwert ${s})`)
  console.log(`  Schueler gewinnen: ${st.schueler} (${Math.round(100 * st.schueler / n)} %)`)
  console.log(`  Schatten gewinnt:  ${st.schatten} (${Math.round(100 * st.schatten / n)} %)`)
  console.log(`  Naechte im Schnitt: ${st.naechteSchnitt}, laengste Partie: ${st.laengste}`)
  console.log(`  Stefan war Schatten: ${st.stefanSchatten}x, Schluesseltraeger: ${st.stefanSchluessel}x`)
}
