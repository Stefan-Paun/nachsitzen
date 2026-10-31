// Eine Partie: Phasen, Ereignisse und wer was mitbekommt. Reine Logik, kein Netz, keine KI.
// Jedes Ereignis traegt `sichtbar`: die Namen, die es sehen duerfen. Daraus baut der Server
// den Gespraechsverlauf jeder einzelnen Figur (jede hat ihren eigenen Kontext).
// Seit M2.5 gibt es eine echte Nacht: Plaetze, Beobachtungen, Funde, Untersuchungen, Tagesereignisse.

import { verteileRollen, SCHATTEN, SCHLUESSEL } from './rollen.mjs'
import { auswerten } from './abstimmung.mjs'
import { ORT_NAMEN, KLASSENBUCH, istOrt, beobachtungen, funde, tagesereignis, untersuchung } from './welt.mjs'

export const PHASEN = ['abend', 'nacht', 'morgen', 'diskussion', 'abstimmung', 'ergebnis', 'ende']
export const SPRECHRUNDEN = 2        // Diskussionsrunden pro Tag (Hausmeister: 1)
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
    rundenHeute: SPRECHRUNDEN,
    plaetze: {},                      // Nacht: name -> Ort
    nachtwahl: null,                  // Ziel des Schattens in dieser Nacht
    pruefung: null,                   // { wer, ziel, rolle } des Schluesseltraegers
    letzteNacht: null,                // { plaetze, schatten, opfer } fuer Untersuchungen am Tag
    naechte: [],                      // alle Naechte, fuer die Wahrheit am Ende
    verwischt: false,                 // hat der Schatten heute Nacht seine Spur verwischt?
    verwischtBenutzt: false,          // nur einmal pro Partie
    untersucht: [],                   // wer heute schon untersucht hat
    ergebnisse: {},                   // heutige Untersuchungsergebnisse je Figur (fuer Vorzeigen)
    vorgezeigt: [],                   // wer heute schon einen Beweis vorgezeigt hat
    offeneAbstimmung: false,          // Standard: geheim; die Glocke macht sie offen
    stimmen: {},
    ereignisse: [],
    sieger: null,                     // 'schueler' | 'schatten' | null
    zufall,
  }
  melde(p, 'start', { text: 'Die Tür fällt ins Schloss. Sieben Pulte, eine Lampe.' })
  for (const name of namen) melde(p, 'rolle', { name, rolle: rollen[name] }, [name])
  return p
}

function melde(p, art, daten, sichtbar = null) {
  if ('sichtbar' in daten) throw new Error('Ereignisfeld "sichtbar" ist reserviert')
  p.ereignisse.push({ nr: p.ereignisse.length, nacht: p.nacht, phase: p.phase, art, ...daten, sichtbar: sichtbar ?? [...p.namen] })
}

export function schatten(p) { return p.namen.find((n) => p.rollen[n] === SCHATTEN) }
export function schluesseltraeger(p) { return p.namen.find((n) => p.rollen[n] === SCHLUESSEL) }
export function lebt(p, name) { return p.lebende.includes(name) }

// Verlauf aus Sicht einer Figur: nur, was sie sehen durfte.
export function verlaufFuer(p, name) {
  return p.ereignisse.filter((e) => e.sichtbar.includes(name))
}

function pruefePhase(p, ...erlaubt) {
  if (!erlaubt.includes(p.phase)) throw new Error(`Nicht erlaubt in Phase "${p.phase}" (erwartet: ${erlaubt.join('/')})`)
}

// --- Sprechen (Abend, Diskussion, laute Begruendung bei der Abstimmung) ------------------

export function sprechen(p, von, text, an = null, behauptet = null) {
  pruefePhase(p, 'abend', 'diskussion', 'abstimmung')
  if (!lebt(p, von)) throw new Error(`${von} ist nicht im Raum`)
  if (an && !lebt(p, an)) throw new Error(`${an} ist nicht im Raum`)
  if (behauptet && !istOrt(behauptet)) behauptet = null
  melde(p, 'sagt', { von, an, text, behauptet }, [...p.lebende])   // behauptet = genannter eigener Nachtplatz (kann gelogen sein)
}

export function schweigen(p, von) {
  pruefePhase(p, 'abend', 'diskussion')
  melde(p, 'schweigt', { von }, [...p.lebende])
}

// --- Nacht -------------------------------------------------------------------------------

export function abendBeenden(p) {
  pruefePhase(p, 'abend')
  nachtBeginnen(p)
}

function nachtBeginnen(p) {
  p.nacht += 1
  p.phase = 'nacht'
  p.plaetze = {}
  p.nachtwahl = null
  p.pruefung = null
  p.stimmen = {}
  p.untersucht = []
  p.verwischt = false
  p.ergebnisse = {}
  p.vorgezeigt = []
  p.offeneAbstimmung = false
  p.rundenHeute = SPRECHRUNDEN
  melde(p, 'nacht', { text: 'Die Lampe erlischt. Jeder sucht sich einen Platz.' })
  if (p.nacht > MAX_NAECHTE) throw new Error('Zu viele Nächte - Spiellogik hängt')
}

// Jede lebende Figur stellt sich nachts irgendwohin. Nur sie selbst weiss, wo.
export function platzWaehlen(p, wer, ort) {
  pruefePhase(p, 'nacht')
  if (!lebt(p, wer)) throw new Error(`${wer} ist nicht im Raum`)
  if (!istOrt(ort)) throw new Error(`Kein Ort: ${ort}`)
  p.plaetze[wer] = ort
  melde(p, 'platz', { wer, ort }, [wer])
}

// Wen der Schatten heute holen darf: nicht sich selbst, und in Nacht 1 nicht den Menschen
// (sonst erlebt ein neuer Spieler sein erstes Spiel nur als Zuschauer).
export function holbar(p) {
  const s = schatten(p)
  return p.lebende.filter((n) => n !== s && !(p.nacht === 1 && n === p.spieler))
}

export function darfVerwischen(p) { return !p.verwischtBenutzt }

export function schattenWaehlt(p, ziel, verwischen = false) {
  pruefePhase(p, 'nacht')
  const s = schatten(p)
  if (!lebt(p, s)) throw new Error('Der Schatten ist nicht mehr im Spiel')
  if (!holbar(p).includes(ziel)) throw new Error(`Ungültiges Ziel: ${ziel}`)
  if (verwischen && !darfVerwischen(p)) throw new Error('Die Spur lässt sich nur einmal pro Partie verwischen')
  p.nachtwahl = ziel
  if (verwischen) { p.verwischt = true; p.verwischtBenutzt = true }
  melde(p, 'schatten-waehlt', { ziel, verwischt: !!verwischen }, [s])
}

export function schluesselPrueft(p, ziel) {
  pruefePhase(p, 'nacht')
  const k = schluesseltraeger(p)
  if (!lebt(p, k)) throw new Error('Der Schlüsselträger ist nicht mehr im Spiel')
  if (ziel === k || !lebt(p, ziel)) throw new Error(`Ungültiges Ziel: ${ziel}`)
  const rolle = p.rollen[ziel]
  p.pruefung = { wer: k, ziel, rolle }
  melde(p, 'pruefung', { ziel, istSchatten: rolle === SCHATTEN }, [k])
  return rolle === SCHATTEN
}

export function morgen(p) {
  pruefePhase(p, 'nacht')
  if (!p.nachtwahl) throw new Error('Der Schatten hat noch nicht gewählt')
  if (lebt(p, schluesseltraeger(p)) && !p.pruefung) throw new Error('Der Schlüsselträger hat noch nicht geprüft')
  const ohnePlatz = p.lebende.filter((n) => !p.plaetze[n])
  if (ohnePlatz.length) throw new Error(`Ohne Platz: ${ohnePlatz.join(', ')}`)
  const s = schatten(p), opfer = p.nachtwahl
  const nacht = { nacht: p.nacht, plaetze: { ...p.plaetze }, schatten: s, opfer, verwischt: p.verwischt }
  p.letzteNacht = nacht
  p.naechte.push(nacht)

  // Was jeder mitbekommen hat (privat, wahr) - noch bevor das Opfer verschwindet
  const beob = beobachtungen({ ...nacht, lebende: p.lebende, zufall: p.zufall })   // nacht.verwischt steckt mit drin
  for (const [name, zeilen] of Object.entries(beob)) for (const b of zeilen) melde(p, 'beobachtung', { wer: name, ...b }, [name])

  p.lebende = p.lebende.filter((n) => n !== opfer)
  p.verschwunden.push(opfer)
  p.phase = 'morgen'
  melde(p, 'verschwunden', { name: opfer, text: `Das Pult von ${opfer} ist leer. Ein Tintenfleck, sonst nichts.` })
  if (siegPruefen(p)) return
  for (const f of funde({ ...nacht, zufall: p.zufall })) melde(p, 'fund', f)
  const ereignis = tagesereignis({ ...nacht, zufall: p.zufall })
  if (ereignis) {
    const { art, ...rest } = ereignis
    melde(p, art, rest)
    if (ereignis.art === 'hausmeister') p.rundenHeute = 1
    if (ereignis.art === 'glocke') p.offeneAbstimmung = true
  }
  p.phase = 'diskussion'
  p.runde = 1
  melde(p, 'diskussion', { runde: 1, von: p.rundenHeute })
}

// --- Tag: untersuchen, reden, abstimmen -------------------------------------------------

// Einmal pro Tag darf jede Figur einen Ort oder das Klassenbuch untersuchen (in Runde 1).
export function untersuchen(p, wer, ort) {
  pruefePhase(p, 'diskussion')
  if (!lebt(p, wer)) throw new Error(`${wer} ist nicht im Raum`)
  if (p.untersucht.includes(wer)) throw new Error(`${wer} hat heute schon untersucht`)
  if (ort !== KLASSENBUCH && !istOrt(ort)) throw new Error(`Kein Ort: ${ort}`)
  p.untersucht.push(wer)
  const erg = untersuchung({ ort, ...p.letzteNacht, wer, zufall: p.zufall })
  p.ergebnisse[wer] = erg
  melde(p, 'untersucht', { von: wer, ort }, [...p.lebende])
  melde(p, 'ergebnis', { wer, ...erg }, [wer])
  return erg.text
}

// Das eigene Untersuchungsergebnis allen zeigen. Das Spiel buergt dafuer, dass es wahr ist.
export function vorzeigen(p, wer) {
  pruefePhase(p, 'diskussion', 'abstimmung')
  if (!lebt(p, wer)) throw new Error(`${wer} ist nicht im Raum`)
  const erg = p.ergebnisse[wer]
  if (!erg) throw new Error(`${wer} hat heute nichts untersucht`)
  if (p.vorgezeigt.includes(wer)) throw new Error(`${wer} hat das heute schon gezeigt`)
  p.vorgezeigt.push(wer)
  melde(p, 'beweis', { von: wer, ort: erg.ort, text: erg.text }, [...p.lebende])
  return erg
}

export function naechsteRunde(p) {
  pruefePhase(p, 'diskussion')
  if (p.runde >= p.rundenHeute) {
    p.phase = 'abstimmung'
    melde(p, 'abstimmung', { text: p.offeneAbstimmung ? 'Wer kommt in den Keller? Heute offen: Jeder sieht sofort, wer wie stimmt.' : 'Wer kommt in den Keller? Jeder schreibt seinen Namen auf einen Zettel, gezeigt wird erst am Ende.', offen: p.offeneAbstimmung })
  } else {
    p.runde += 1
    melde(p, 'diskussion', { runde: p.runde, von: p.rundenHeute })
  }
}

export function stimme(p, von, fuer) {
  pruefePhase(p, 'abstimmung')
  if (!lebt(p, von)) throw new Error(`${von} ist nicht im Raum`)
  if (fuer != null && (!lebt(p, fuer) || fuer === von)) throw new Error(`Ungültige Stimme von ${von} für ${fuer}`)
  p.stimmen[von] = fuer
  melde(p, 'stimme', { von, fuer }, p.offeneAbstimmung ? [...p.lebende] : [von])   // geheim: nur der Waehler sieht seinen Zettel
}

export function abstimmungSchliessen(p) {
  pruefePhase(p, 'abstimmung')
  const fehlt = p.lebende.filter((n) => !(n in p.stimmen))
  if (fehlt.length) throw new Error(`Es fehlen Stimmen von: ${fehlt.join(', ')}`)
  const erg = auswerten(p.stimmen, p.lebende)
  p.phase = 'ergebnis'
  // Die Zettel werden aufgedeckt: alle Stimmen auf einmal
  melde(p, 'zettelwahl', { stimmen: { ...p.stimmen } })
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
  // Die Wahrheit: alle Rollen und wer in welcher Nacht wo stand
  melde(p, 'wahrheit', { rollen: { ...p.rollen }, naechte: p.naechte.map((n) => ({ nacht: n.nacht, plaetze: { ...n.plaetze }, schatten: n.schatten, opfer: n.opfer, verwischt: !!n.verwischt })) })
  return true
}

// Kompakte Zusammenfassung fuer Anzeige und Hefte.
export function zusammenfassung(p) {
  return {
    naechte: p.nacht, sieger: p.sieger, schatten: schatten(p),
    verschwunden: [...p.verschwunden], keller: [...p.keller], uebrig: [...p.lebende],
  }
}

export { ORT_NAMEN, KLASSENBUCH }
