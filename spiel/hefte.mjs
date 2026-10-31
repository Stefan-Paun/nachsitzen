// Die Hefte: Was jede Figur nach einer Partie ueber die anderen festhaelt. Das Heft wandert in den
// Systemprompt der naechsten Partie - so entstehen Freunde, Feinde und alte Rechnungen.
// Eine JSON-Datei pro Figur unter ~/.local/share/nachsitzen/hefte/, atomar und privat geschrieben.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const MAX_EINTRAEGE_IM_PROMPT = 5
export const VERTRAUEN = { '-2': 'traue ich gar nicht', '-1': 'bin ich skeptisch', '0': 'weiß ich nicht', '1': 'traue ich eher', '2': 'vertraue ich' }

export function standardOrdner() {
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'nachsitzen', 'hefte')
}

export function hefteSpeicher({ ordner = standardOrdner() } = {}) {
  const datei = (name) => path.join(ordner, `${name.toLowerCase().replace(/[^a-zäöüß0-9_-]/gi, '_')}.json`)
  const lesen = (name) => { try { return JSON.parse(fs.readFileSync(datei(name), 'utf8')) } catch { return [] } }
  return {
    lesen,
    schreiben(name, eintrag) {
      const liste = lesen(name)
      liste.push({ datum: new Date().toISOString().slice(0, 10), ...eintrag })
      fs.mkdirSync(ordner, { recursive: true, mode: 0o700 })
      const tmp = `${datei(name)}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(liste.slice(-50), null, 1), { mode: 0o600 })
      fs.renameSync(tmp, datei(name))
      return liste.length
    },
    // Text fuer den Systemprompt: die letzten Eintraege, neueste zuletzt, plus aktuelles Vertrauen.
    alsText(name) {
      const liste = lesen(name).slice(-MAX_EINTRAEGE_IM_PROMPT)
      if (!liste.length) return ''
      const vertrauen = {}
      for (const e of liste) for (const [n, w] of Object.entries(e.vertrauen || {})) vertrauen[n] = w
      const zeilen = liste.map((e) => `- ${e.datum}: ${e.eintrag}`)
      const v = Object.entries(vertrauen).map(([n, w]) => `${n}: ${VERTRAUEN[String(w)] ?? 'weiß ich nicht'}`)
      return `${zeilen.join('\n')}\n\nWem du nach allem traust: ${v.length ? v.join(', ') : 'noch niemandem besonders'}.`
    },
    alle(namen) { return Object.fromEntries(namen.map((n) => [n, lesen(n)])) },
  }
}

// Eintrag aus der Werkzeug-Antwort bauen und absichern (Werte -2..2, nur bekannte Namen).
export function eintragBauen({ eintrag, vertrauen }, namen) {
  let text = String(eintrag || '').trim()
  if (text.length > 900) {                                   // am Satzende kuerzen, nicht mitten im Wort
    const kurz = text.slice(0, 900)
    const ende = Math.max(kurz.lastIndexOf('. '), kurz.lastIndexOf('! '), kurz.lastIndexOf('? '))
    text = ende > 200 ? kurz.slice(0, ende + 1) : kurz
  }
  if (!text) text = 'Eine Nacht, über die ich nicht reden will.'
  const v = {}
  for (const x of Array.isArray(vertrauen) ? vertrauen : []) {
    if (namen.includes(x?.name)) v[x.name] = Math.max(-2, Math.min(2, Math.round(Number(x.wert) || 0)))
  }
  return { eintrag: text, vertrauen: v }
}
