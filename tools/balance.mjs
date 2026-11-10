// Balance-Messung fuer docs/balance-petze.md: Schatten-Siegquote fuer 4-8 Figuren, ohne und mit Petze.
// Aufruf: node tools/balance.mjs [partien] [startwert]   (Skript-Gehirne, kein Netz, kostet nichts)

import { statistik } from './simuliere.mjs'
import { PETZE_AB } from '../spiel/rollen.mjs'
import { PETZE_JEDE } from '../spiel/partie.mjs'

export const ALLE_NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Stefan', 'Ben']

// Liefert Zeilen { figuren, petze, jede, quote } (quote = Schatten-Siegquote in %).
export async function messen({ partien = 2000, startwert = 1, figuren = [4, 5, 6, 7, 8], varianten = [{ petze: false }, { petze: true, petzeJede: 1 }, { petze: true, petzeJede: PETZE_JEDE }] } = {}) {
  const zeilen = []
  for (const n of figuren) for (const v of varianten) {
    const st = await statistik(partien, startwert, ALLE_NAMEN.slice(0, n), v)
    zeilen.push({ figuren: n, petze: v.petze, jede: v.petze ? (v.petzeJede ?? PETZE_JEDE) : null, quote: +(100 * st.schatten / st.partien).toFixed(1), naechte: st.naechteSchnitt })
  }
  return zeilen
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const partien = Number(process.argv[2] || 2000), startwert = Number(process.argv[3] || 1)
  console.log(`Schatten-Siegquote in %, ${partien} Partien je Zelle, Startwert ${startwert}, Petze ab ${PETZE_AB} Figuren`)
  for (const z of await messen({ partien, startwert })) console.log(`${z.figuren} Figuren | ${z.petze ? `Petze, jede ${z.jede}. Nacht` : 'ohne Petze'} | ${z.quote} % | ${z.naechte} Nächte`)
}
