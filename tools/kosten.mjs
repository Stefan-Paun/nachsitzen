// Verbrauch der letzten 14 Tage als Tabelle. Liest nur kosten.json (Zahlen), nie Hefte oder Schluessel.
import fs from 'node:fs'
import { standardPfad, kostenBericht, deckelAusUmgebung } from '../spiel/kosten.mjs'

let daten = {}
try { daten = JSON.parse(fs.readFileSync(standardPfad(), 'utf8')) } catch { /* noch nichts gespielt */ }
console.log(kostenBericht(daten))
console.log(`Tagesdeckel: ${deckelAusUmgebung()} $`)
