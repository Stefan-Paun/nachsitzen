// Eigene Figuren auf der Platte: eine JSON-Datei je Figur in <Datenordner>/nachsitzen/figuren/,
// neben den Heften, ausserhalb des Repos. Der Dateiname kommt aus der bereinigten Kennung, nie aus Rohtext.
// Geloeschte Figuren wandern in den Unterordner `geloescht` (kein echtes Loeschen).

import fs from 'node:fs'
import path from 'node:path'
import { standardOrdner } from './ordner.mjs'
import { pruefeFigur, kennung, KENNUNG_MUSTER, MAX_EIGENE } from './figurenschema.mjs'

export const MAX_DATEI = 8_000   // Bytes; groesser ist keine Figur

export function figurenOrdner() { return path.join(standardOrdner(), 'figuren') }

export class FigurenFehler extends Error {
  constructor(text, status = 400, fehler = []) { super(text); this.status = status; this.fehler = fehler }
}

// ordner ist Pflicht-Argument mit Standardwert; Tests uebergeben immer einen Temp-Ordner.
export function figurenSpeicher({ ordner = figurenOrdner(), jetzt = () => Date.now() } = {}) {
  const wurzel = path.resolve(ordner)
  // Einziger Weg von einer Kennung zu einem Pfad: Muster pruefen, dann innerhalb des Ordners bleiben.
  const datei = (k) => {
    if (typeof k !== 'string' || k.length > 24 || !KENNUNG_MUSTER.test(k)) throw new FigurenFehler('Ungültige Kennung', 400)
    const p = path.resolve(wurzel, `${k}.json`)
    if (path.dirname(p) !== wurzel) throw new FigurenFehler('Ungültige Kennung', 400)
    return p
  }
  const lesenDatei = (p) => {
    const st = fs.lstatSync(p)
    if (!st.isFile() || st.size > MAX_DATEI) return null
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  const schreiben = (p, figur) => {
    fs.mkdirSync(wurzel, { recursive: true, mode: 0o700 })
    const tmp = `${p}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(figur, null, 1), { mode: 0o600 })
    fs.renameSync(tmp, p)
  }

  function liste() {
    let namen
    try { namen = fs.readdirSync(wurzel) } catch { return { figuren: [], kaputt: [] } }
    const figuren = [], kaputt = []
    for (const n of namen.sort()) {
      const m = /^(.+)\.json$/.exec(n)
      if (!m || !KENNUNG_MUSTER.test(m[1])) continue
      try {
        const roh = lesenDatei(path.join(wurzel, n))
        const r = roh && pruefeFigur(roh)
        if (!r?.ok || kennung(r.figur.name) !== m[1]) { kaputt.push(m[1]); continue }
        figuren.push({ kennung: m[1], ...r.figur })
      } catch { kaputt.push(m[1]) }
    }
    return { figuren, kaputt }
  }

  const lesen = (k) => liste().figuren.find((f) => f.kennung === k) ?? null
  const vonName = (name) => liste().figuren.find((f) => f.name.toLowerCase() === String(name).toLowerCase()) ?? null

  function pruefen(roh) {
    const r = pruefeFigur(roh)
    if (!r.ok) throw new FigurenFehler('Die Figur ist nicht gültig', 400, r.fehler)
    return r.figur
  }

  return {
    ordner: wurzel, liste, lesen, vonName,
    anlegen(roh) {
      const figur = pruefen(roh)
      const k = kennung(figur.name)
      const p = datei(k)
      if (fs.existsSync(p)) throw new FigurenFehler(`Es gibt schon eine Figur „${figur.name}“`, 409)
      if (liste().figuren.length >= MAX_EIGENE) throw new FigurenFehler(`Höchstens ${MAX_EIGENE} eigene Figuren`, 409)
      schreiben(p, figur)
      return { kennung: k, ...figur }
    },
    ersetzen(k, roh) {
      const p = datei(k)
      const figur = pruefen(roh)
      if (kennung(figur.name) !== k) throw new FigurenFehler('Der Name passt nicht zur Kennung; zum Umbenennen eine neue Figur anlegen', 400)
      if (!fs.existsSync(p)) throw new FigurenFehler('Figur nicht gefunden', 404)
      schreiben(p, figur)
      return { kennung: k, ...figur }
    },
    loeschen(k) {
      const p = datei(k)
      if (!fs.existsSync(p)) throw new FigurenFehler('Figur nicht gefunden', 404)
      const korb = path.join(wurzel, 'geloescht')
      fs.mkdirSync(korb, { recursive: true, mode: 0o700 })
      const ziel = path.join(korb, `${k}-${jetzt()}.json`)
      fs.renameSync(p, ziel)
      return path.basename(ziel)
    },
  }
}
