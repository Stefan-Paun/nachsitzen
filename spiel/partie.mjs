// Eine Partie: Phasen, Ereignisse und wer was mitbekommt. Reine Logik, kein Netz, keine KI.
// Jedes Ereignis traegt `fuer`: die Namen, die es sehen duerfen. Daraus baut der Server
// spaeter den Gespraechsverlauf jeder einzelnen Figur (jede hat ihren eigenen Kontext).

import { verteileRollen, SCHATTEN, SCHLUESSEL } from './rollen.mjs'
import { auswerten } from './abstimmung.mjs'

export const PHASEN = ['abend', 'nacht', 'morgen', 'diskussion', 'abstimmung', 'ergebnis', 'ende']
export const SPRECHRUNDEN = 3        // Diskussionsrunden pro Tag
export const MAX_NAECHTE = 10        // Notbremse gegen Endlosschleifen

export function neuePartie(namen, zufall, { spieler = null } = {}) {
  const rollen = verteileRollen(namen, zufall)
  const p = {
    namen: [...namen],
    spieler,                          // Name der menschlichen Figur (oder null = nur KI)
    rollen,
    lebende: [...namen],
    keller: [],                       // eingesperrt (Rolle oeffentlich bekannt)
    verschwunden: [],                 // vom Schatten geholt
    phase: 'abend',
    nacht: 0,
    runde: 0,                         // Sprechrunde innerhalb der Diskussion
    nachtwahl: null,                  // Ziel des Schattens in dieser Nacht
    pruefung: null,                   // { wer, ziel, rolle } des Schluesseltraegers
    stimmen: {},
    ereignisse: [],
    sieger: null,                     // 'schueler' | 'schatten' | null
  }
  melde(p, 'start', { text: 'Die Tuer faellt ins Schloss. Sechs Pulte, eine Lampe.' })
  for (const name of namen) melde(p, 'rolle', { name, rolle: rollen[name] }, [name])
  return p
}

function melde(p, art, daten, fuer = null) {
  p.ereignisse.push({ nr: p.ereignisse.length, nacht: p.nacht, phase: p.phase, art, ...daten, fuer: fuer ?? [...p.namen] })
}

export function schatten(p) { return p.namen.find((n) => p.rollen[n] === SCHATTEN) }
export function schluesseltraeger(p) { return p.namen.find((n) => p.rollen[n] === SCHLUESSEL) }
export function lebt(p, name) { return p.lebende.includes(name) }

// Verlauf aus Sicht einer Figur: nur, was sie sehen durfte.
export function verlaufFuer(p, name) {
  return p.ereignisse.filter((e) => e.fuer.includes(name))
}

function pruefePhase(p, ...erlaubt) {
  if (!erlaubt.includes(p.phase)) throw new Error(`Nicht erlaubt in Phase "${p.phase}" (erwartet: ${erlaubt.join('/')})`)
}

// --- Sprechen (Abend und Diskussion) -----------------------------------------------------

export function sprechen(p, von, text, an = null) {
  pruefePhase(p, 'abend', 'diskussion', 'abstimmung')   // bei der Abstimmung: die laute Begruendung
  if (!lebt(p, von)) throw new Error(`${von} ist nicht im Raum`)
  if (an && !lebt(p, an)) throw new Error(`${an} ist nicht im Raum`)
  melde(p, 'sagt', { von, an, text }, [...p.lebende])
}

export function schweigen(p, von) {
  pruefePhase(p, 'abend', 'diskussion')
  melde(p, 'schweigt', { von }, [...p.lebende])
}

// --- Phasenwechsel -----------------------------------------------------------------------

export function abendBeenden(p) {
  pruefePhase(p, 'abend')
  nachtBeginnen(p)
}

function nachtBeginnen(p) {
  p.nacht += 1
  p.phase = 'nacht'
  p.nachtwahl = null
  p.pruefung = null
  p.stimmen = {}
  melde(p, 'nacht', { text: 'Die Lampe erlischt.' })
  if (p.nacht > MAX_NAECHTE) throw new Error('Zu viele Naechte - Spiellogik haengt')
}

export function schattenWaehlt(p, ziel) {
  pruefePhase(p, 'nacht')
  const s = schatten(p)
  if (!lebt(p, s)) throw new Error('Der Schatten ist nicht mehr im Spiel')
  if (ziel === s || !lebt(p, ziel)) throw new Error(`Ungueltiges Ziel: ${ziel}`)
  p.nachtwahl = ziel
  melde(p, 'schatten-waehlt', { ziel }, [s])
}

export function schluesselPrueft(p, ziel) {
  pruefePhase(p, 'nacht')
  const k = schluesseltraeger(p)
  if (!lebt(p, k)) throw new Error('Der Schluesseltraeger ist nicht mehr im Spiel')
  if (ziel === k || !lebt(p, ziel)) throw new Error(`Ungueltiges Ziel: ${ziel}`)
  const rolle = p.rollen[ziel]
  p.pruefung = { wer: k, ziel, rolle }
  melde(p, 'pruefung', { ziel, istSchatten: rolle === SCHATTEN }, [k])
  return rolle === SCHATTEN
}

export function morgen(p) {
  pruefePhase(p, 'nacht')
  if (!p.nachtwahl) throw new Error('Der Schatten hat noch nicht gewaehlt')
  if (lebt(p, schluesseltraeger(p)) && !p.pruefung) throw new Error('Der Schluesseltraeger hat noch nicht geprueft')
  const weg = p.nachtwahl
  p.lebende = p.lebende.filter((n) => n !== weg)
  p.verschwunden.push(weg)
  p.phase = 'morgen'
  melde(p, 'verschwunden', { name: weg, text: `Das Pult von ${weg} ist leer. Ein Tintenfleck, sonst nichts.` })
  if (siegPruefen(p)) return
  p.phase = 'diskussion'
  p.runde = 1
  melde(p, 'diskussion', { runde: 1 })
}

export function naechsteRunde(p) {
  pruefePhase(p, 'diskussion')
  if (p.runde >= SPRECHRUNDEN) {
    p.phase = 'abstimmung'
    melde(p, 'abstimmung', { text: 'Wer kommt in den Keller?' })
  } else {
    p.runde += 1
    melde(p, 'diskussion', { runde: p.runde })
  }
}

export function stimme(p, von, fuer) {
  pruefePhase(p, 'abstimmung')
  if (!lebt(p, von)) throw new Error(`${von} ist nicht im Raum`)
  if (fuer != null && (!lebt(p, fuer) || fuer === von)) throw new Error(`Ungueltige Stimme von ${von} fuer ${fuer}`)
  p.stimmen[von] = fuer
  melde(p, 'stimme', { von, fuer }, [...p.lebende])
}

export function abstimmungSchliessen(p) {
  pruefePhase(p, 'abstimmung')
  const fehlt = p.lebende.filter((n) => !(n in p.stimmen))
  if (fehlt.length) throw new Error(`Es fehlen Stimmen von: ${fehlt.join(', ')}`)
  const erg = auswerten(p.stimmen, p.lebende)
  p.phase = 'ergebnis'
  if (erg.eingesperrt) {
    p.lebende = p.lebende.filter((n) => n !== erg.eingesperrt)
    p.keller.push(erg.eingesperrt)
    melde(p, 'eingesperrt', { name: erg.eingesperrt, rolle: p.rollen[erg.eingesperrt], zaehler: erg.zaehler })
  } else {
    melde(p, 'niemand', { gleichstand: erg.gleichstand, zaehler: erg.zaehler })
  }
  if (siegPruefen(p)) return erg
  nachtBeginnen(p)
  return erg
}

// --- Sieg ------------------------------------------------------------------------------

function siegPruefen(p) {
  const s = schatten(p)
  if (!lebt(p, s)) p.sieger = 'schueler'
  else if (p.lebende.length <= 2) p.sieger = 'schatten'
  if (!p.sieger) return false
  p.phase = 'ende'
  melde(p, 'ende', { sieger: p.sieger, schatten: s })
  return true
}

// Kompakte Zusammenfassung fuer Anzeige und Hefte.
export function zusammenfassung(p) {
  return {
    naechte: p.nacht, sieger: p.sieger, schatten: schatten(p),
    verschwunden: [...p.verschwunden], keller: [...p.keller], uebrig: [...p.lebende],
  }
}
