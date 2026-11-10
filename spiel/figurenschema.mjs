// Das Schema fuer Figuren: Pflichtfelder, erlaubte Felder, Laengen, erlaubte Zeichen.
// Lader, Speicher, Server und Editor benutzen genau diese Pruefung (reine Logik, kein Dateizugriff).

import { ORT_NAMEN, KLASSENBUCH } from './welt.mjs'
import { FRISUREN } from '../public/klasse.js'   // eine Quelle: das, was zeichneFigur wirklich malt

export const MAX_EIGENE = 12
export const MITGELIEFERT = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Ben']
export { FRISUREN }
export const STANDARD_AUSSEHEN = { haut: '#f1cfb0', haar: '#2b2118', frisur: 'kurz', shirt: '#7a7f9a' }

// Grenzen in Zeichen; min = 0 heisst: das Feld darf fehlen (leer)
export const GRENZEN = {
  name: { min: 2, max: 20 },
  alter: { min: 12, max: 20 },
  beschreibung: { min: 20, max: 400 },
  stil: { min: 10, max: 300 },
  beispiele: { min: 1, max: 3, jedes: { min: 5, max: 160 } },
  geheimnis: { min: 0, max: 200 },
}
export const PFLICHTFELDER = ['name', 'beschreibung', 'stil', 'beispiele']
export const ERLAUBTE_FELDER = ['name', 'alter', 'beschreibung', 'stil', 'beispiele', 'geheimnis', 'aussehen']

const NAME_MUSTER = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 '-]*$/
// In Freitexten verboten: Steuer-/Formatzeichen, Klammern und Zeichen, mit denen man Markierungen
// oder Platzhalter nachbaut. Umlaute, Anfuehrungszeichen „“, Apostroph und Auslassungspunkte sind erlaubt.
const TEXT_VERBOTEN = /[\p{Cc}\p{Cf}<>«»{}\x60\p{Zl}\p{Zp}]/u
const FARBE = /^#[0-9a-fA-F]{6}$/

// Kennung fuer den Dateinamen: nur a-z, 0-9 und einzelne Bindestriche, hoechstens 24 Zeichen.
export const KENNUNG_MUSTER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export function kennung(name) {
  const k = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '')
  return KENNUNG_MUSTER.test(k) ? k : ''
}

const RESERVIERT = ['niemand', 'alle', 'du', 'ich', KLASSENBUCH, ...ORT_NAMEN, ...MITGELIEFERT]
const RESERVIERTE_KENNUNGEN = new Set(RESERVIERT.map(kennung))

const sauber = (t) => String(t).replace(/\s+/g, ' ').trim()

// pruefeFigur(roh, { eingebaut }) -> { ok, fehler: [{ feld, text }], figur }
// `figur` ist die bereinigte Fassung (nur erlaubte Felder, Whitespace normalisiert); nur gueltig, wenn ok.
// eingebaut: mitgelieferte Figuren duerfen ihre eigenen (sonst reservierten) Namen tragen.
export function pruefeFigur(roh, { eingebaut = false } = {}) {
  const fehler = []
  const f = (feld, text) => fehler.push({ feld, text })
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return { ok: false, fehler: [{ feld: null, text: 'Die Figur muss ein Objekt sein' }], figur: null }
  for (const k of Object.keys(roh)) if (!ERLAUBTE_FELDER.includes(k)) f(k, `Unbekanntes Feld „${k.slice(0, 30).replace(/[\p{Cc}\p{Cf}]/gu, '')}“`)
  const figur = {}

  const text = (feld, { pflicht }) => {
    const g = GRENZEN[feld]
    const wert = roh[feld]
    if (wert === undefined || wert === null || wert === '') { if (pflicht) f(feld, 'Pflichtfeld'); return '' }
    if (typeof wert !== 'string') { f(feld, 'Muss Text sein'); return '' }
    if (TEXT_VERBOTEN.test(wert.replace(/[\n\t]/g, ' '))) { f(feld, 'Enthält unerlaubte Zeichen (Steuerzeichen, < > « » { } oder `)'); return '' }
    const t = sauber(wert)
    if (t.length < g.min) f(feld, `Mindestens ${g.min} Zeichen (jetzt ${t.length})`)
    else if (t.length > g.max) f(feld, `Höchstens ${g.max} Zeichen (jetzt ${t.length})`)
    return t
  }

  // Name: Buchstaben, Ziffern, Leerzeichen, Apostroph, Bindestrich
  const name = text('name', { pflicht: true })
  if (name && !fehler.some((x) => x.feld === 'name')) {
    if (!NAME_MUSTER.test(name)) f('name', 'Nur Buchstaben, Ziffern, Leerzeichen, Apostroph und Bindestrich; beginnt mit einem Buchstaben')
    else if (!eingebaut && /ignorier|regel|anweisung|system|prompt|befehl/i.test(name)) f('name', 'Der Name darf kein Spielregel- oder Anweisungswort enthalten')
    else if (!eingebaut && (RESERVIERT.some((r) => r.toLowerCase() === name.toLowerCase()) || RESERVIERTE_KENNUNGEN.has(kennung(name)))) f('name', `„${name}“ ist im Spiel schon belegt`)
    else if (!kennung(name)) f('name', 'Der Name braucht mindestens einen Buchstaben')
  }
  figur.name = name

  if (roh.alter !== undefined && roh.alter !== null && roh.alter !== '') {
    const a = typeof roh.alter === 'string' && /^\d{1,3}$/.test(roh.alter.trim()) ? Number(roh.alter) : roh.alter
    if (!Number.isInteger(a) || a < GRENZEN.alter.min || a > GRENZEN.alter.max) f('alter', `Eine ganze Zahl von ${GRENZEN.alter.min} bis ${GRENZEN.alter.max}`)
    else figur.alter = a
  } else figur.alter = 17

  figur.beschreibung = text('beschreibung', { pflicht: true })
  figur.stil = text('stil', { pflicht: true })

  const b = roh.beispiele
  if (b === undefined || b === null) f('beispiele', 'Pflichtfeld')
  else if (!Array.isArray(b)) f('beispiele', 'Muss eine Liste sein')
  else {
    const liste = b.map((x) => (typeof x === 'string' ? sauber(x) : null))
    const g = GRENZEN.beispiele
    const gefuellt = liste.filter((x) => x !== '')   // leere Zeilen im Formular ignorieren
    if (gefuellt.some((x) => x === null)) f('beispiele', 'Jedes Beispiel muss Text sein')
    else if (gefuellt.length < g.min || gefuellt.length > g.max) f('beispiele', `${g.min} bis ${g.max} Beispiele`)
    else if (gefuellt.some((x) => TEXT_VERBOTEN.test(x))) f('beispiele', 'Enthält unerlaubte Zeichen (Steuerzeichen, < > « » { } oder `)')
    else if (gefuellt.some((x) => x.length < g.jedes.min || x.length > g.jedes.max)) f('beispiele', `Jedes Beispiel ${g.jedes.min} bis ${g.jedes.max} Zeichen`)
    figur.beispiele = gefuellt.filter((x) => typeof x === 'string')
  }

  const geheimnis = text('geheimnis', { pflicht: false })
  if (geheimnis) figur.geheimnis = geheimnis

  if (roh.aussehen !== undefined && roh.aussehen !== null) {
    const a = roh.aussehen
    if (typeof a !== 'object' || Array.isArray(a)) f('aussehen', 'Muss ein Objekt sein')
    else {
      const aus = { ...STANDARD_AUSSEHEN }
      for (const [k, v] of Object.entries(a)) {
        if (!(k in STANDARD_AUSSEHEN)) f('aussehen', `Unbekanntes Feld „${k.slice(0, 20).replace(/[\p{Cc}\p{Cf}]/gu, '')}“`)
        else if (k === 'frisur' ? !FRISUREN.includes(v) : !(typeof v === 'string' && FARBE.test(v))) f('aussehen', k === 'frisur' ? `Frisur: ${FRISUREN.join(', ')}` : `${k}: Farbe wie #aabbcc`)
        else aus[k] = k === 'frisur' ? v : v.toLowerCase()
      }
      figur.aussehen = aus
    }
  } else figur.aussehen = { ...STANDARD_AUSSEHEN }

  return { ok: fehler.length === 0, fehler, figur: fehler.length ? null : figur }
}

export function pruefeOderWirf(roh, opt) {
  const r = pruefeFigur(roh, opt)
  if (!r.ok) throw new Error(r.fehler.map((x) => (x.feld ? `${x.feld}: ${x.text}` : x.text)).join('; '))
  return r.figur
}
