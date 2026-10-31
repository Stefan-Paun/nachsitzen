// Kostenzaehler mit Tagesdeckel. Haiku 5.5: 0,10 $ / 0,50 $ pro Million Token (Eingabe/Ausgabe),
// Cache-Lesen 0,01 $, Cache-Schreiben 0,125 $. Liegt der Tag ueber dem Deckel, schliesst die Schule.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const PREISE = { eingabe: 0.10, ausgabe: 0.50, cacheLesen: 0.01, cacheSchreiben: 0.125 }   // $ pro MTok
export const DECKEL_PRO_TAG = 0.50                                                              // $

export function kostenRechner({ pfad = standardPfad(), deckel = DECKEL_PRO_TAG, heute = () => new Date().toISOString().slice(0, 10) } = {}) {
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
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'nachsitzen', 'kosten.json')
}
