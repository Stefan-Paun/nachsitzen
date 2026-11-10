// Kostenzaehler mit Tagesdeckel. Haiku 5.5: 0,10 $ / 0,50 $ pro Million Token (Eingabe/Ausgabe),
// Cache-Lesen 0,01 $, Cache-Schreiben 0,125 $. Liegt der Tag ueber dem Deckel, schliesst die Schule.

import fs from 'node:fs'
import path from 'node:path'
import { standardOrdner } from './ordner.mjs'

export const PREISE = { eingabe: 0.10, ausgabe: 0.50, cacheLesen: 0.01, cacheSchreiben: 0.125 }   // $ pro MTok
export const DECKEL_PRO_TAG = 0.50                                                              // $

// Deckel aus NACHSITZEN_DECKEL (Dollar, Zahl > 0); sonst Standard und eine Warnung.
export function deckelAusUmgebung(env = process.env, warne = (m) => console.warn(m)) {
  const roh = env.NACHSITZEN_DECKEL
  if (roh === undefined || roh === '') return DECKEL_PRO_TAG
  const zahl = /^\s*\d+([.,]\d+)?\s*$/.test(roh) ? Number(roh.trim().replace(',', '.')) : NaN
  if (Number.isFinite(zahl) && zahl > 0) return zahl
  warne(`NACHSITZEN_DECKEL="${roh}" ist keine Zahl > 0 - es gilt der Standard von ${DECKEL_PRO_TAG} $`)
  return DECKEL_PRO_TAG
}

// Tabelle der letzten Tage aus dem Kosten-Objekt ({ 'JJJJ-MM-TT': { aufrufe, eingabe, ausgabe, ... dollar } }).
export function kostenBericht(daten = {}, { heute = new Date().toISOString().slice(0, 10), tage = 14 } = {}) {
  const ende = Date.parse(heute)
  const ab = new Date(ende - (tage - 1) * 864e5).toISOString().slice(0, 10)
  const zeilen = Object.keys(daten).filter((d) => d >= ab && d <= heute).sort().map((d) => {
    const t = daten[d] || {}
    const token = (t.eingabe || 0) + (t.ausgabe || 0) + (t.cacheLesen || 0) + (t.cacheSchreiben || 0)
    return { datum: d, aufrufe: t.aufrufe || 0, token, cent: (t.dollar || 0) * 100 }
  })
  if (!zeilen.length) return `Keine Verbrauchsdaten in den letzten ${tage} Tagen.`
  const rechts = (x, n) => String(x).padStart(n)
  const kopf = `${'Datum'.padEnd(10)}  ${rechts('Aufrufe', 7)}  ${rechts('Token', 10)}  ${rechts('Cent', 8)}`
  const tab = zeilen.map((z) => `${z.datum}  ${rechts(z.aufrufe, 7)}  ${rechts(z.token, 10)}  ${rechts(z.cent.toFixed(2), 8)}`)
  const aufrufe = zeilen.reduce((a, z) => a + z.aufrufe, 0), cent = zeilen.reduce((a, z) => a + z.cent, 0)
  const token = zeilen.reduce((a, z) => a + z.token, 0)
  const schnitt = aufrufe ? `${(cent / aufrufe).toFixed(3)} Cent pro Aufruf` : 'kein Durchschnitt (keine Aufrufe)'
  return [kopf, ...tab, `${'Summe'.padEnd(10)}  ${rechts(aufrufe, 7)}  ${rechts(token, 10)}  ${rechts(cent.toFixed(2), 8)}`, `Durchschnitt: ${schnitt}`].join('\n')
}

export function kostenRechner({ pfad = standardPfad(), deckel = deckelAusUmgebung(), heute = () => new Date().toISOString().slice(0, 10) } = {}) {
  const lade = () => { try { return JSON.parse(fs.readFileSync(pfad, 'utf8')) } catch { return {} } }
  const speichere = (d) => {
    fs.mkdirSync(path.dirname(pfad), { recursive: true, mode: 0o700 })
    const tmp = `${pfad}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 })
    fs.renameSync(tmp, pfad)
  }
  const tag = () => { const d = lade(); return d[heute()] || { aufrufe: 0, eingabe: 0, ausgabe: 0, cacheLesen: 0, cacheSchreiben: 0, dollar: 0 } }
  return {
    pruefen() {
      const t = tag()
      if (t.dollar >= deckel) throw new Error(`Tagesdeckel erreicht (${t.dollar.toFixed(3)} $ von ${deckel} $) - die Schule schliesst fuer heute`)
    },
    buchen(usage = {}) {
      const d = lade(), t = d[heute()] || tag()
      const e = usage.input_tokens || 0, a = usage.output_tokens || 0
      const cl = usage.cache_read_input_tokens || 0, cs = usage.cache_creation_input_tokens || 0
      t.aufrufe += 1; t.eingabe += e; t.ausgabe += a; t.cacheLesen += cl; t.cacheSchreiben += cs
      t.dollar += (e * PREISE.eingabe + a * PREISE.ausgabe + cl * PREISE.cacheLesen + cs * PREISE.cacheSchreiben) / 1e6
      d[heute()] = t
      speichere(d)
      return t
    },
    heute: tag,
  }
}

export function standardPfad() {
  return path.join(standardOrdner(), 'kosten.json')
}
