// Die Welt hinter dem Gerede: Orte im Klassenzimmer, wo nachts wirklich wer stand, welche Spuren
// der Schatten hinterlaesst und was jede Figur davon mitbekommt. Alles hier ist WAHR; die Figuren
// bekommen nur Ausschnitte. Reine Funktionen, deterministisch mit dem Zufall der Partie.

export const ORTE = [
  { name: 'Tür', bei: 'bei der Tür' },
  { name: 'Schrank', bei: 'beim Schrank' },
  { name: 'Tafel', bei: 'an der Tafel' },
  { name: 'Pult vorne', bei: 'am Pult vorne' },
  { name: 'Pult hinten', bei: 'am Pult hinten' },
  { name: 'Fenster', bei: 'am Fenster' },
]
export const ORT_NAMEN = ORTE.map((o) => o.name)
export const KLASSENBUCH = 'Klassenbuch'
export const bei = (ort) => ORTE.find((o) => o.name === ort)?.bei ?? ort
const idx = (ort) => ORT_NAMEN.indexOf(ort)

export function istOrt(ort) { return ORT_NAMEN.includes(ort) }

// Orte, die der Schatten auf dem Weg vom eigenen Platz zum Opfer durchquert (ohne Start und Ziel).
export function durchquert(von, nach) {
  const a = idx(von), b = idx(nach)
  if (a < 0 || b < 0 || Math.abs(a - b) < 2) return []
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return ORT_NAMEN.slice(lo + 1, hi)
}

// Was jede Figur in dieser Nacht mitbekommt. plaetze: { name: ort }, schatten/opfer: Namen.
// Liefert { name: [text, ...] } fuer alle Lebenden ausser dem Opfer. Jede Zeile ist wahr.
export function beobachtungen({ plaetze, lebende, schatten, opfer, zufall }) {
  const erg = {}
  const pS = idx(plaetze[schatten])
  for (const a of lebende) {
    if (a === opfer) continue
    const zeilen = []
    const andere = lebende.filter((n) => n !== a)
    const pA = idx(plaetze[a])
    if (zufall.zahl() < 0.6) {
      const b = zufall.aus(andere)
      zeilen.push(`Du hast gesehen: ${b} stand ${bei(plaetze[b])}.`)
    }
    if (a !== schatten) {
      if (Math.abs(pA - pS) <= 1 && zufall.zahl() < 0.5) {
        zeilen.push(pA === pS ? 'Jemand direkt neben dir ist eine Weile weg gewesen.' : `Es hat sich jemand ${bei(plaetze[schatten])} bewegt, ganz in deiner Nähe.`)
      }
      if (zufall.zahl() < 0.5) {
        zeilen.push(pS === pA ? 'Schritte, ganz nah bei dir.' : `Schritte, ${pS < pA ? 'von der Türseite her' : 'von der Fensterseite her'}.`)
      }
    }
    if (!zeilen.length) {
      const b = zufall.aus(andere)
      zeilen.push(`Du hast gesehen: ${b} stand ${bei(plaetze[b])}.`)
    }
    erg[a] = zeilen
  }
  return erg
}

// Oeffentliche Fundstuecke am Morgen, aus dem echten Weg des Schattens.
export function funde({ plaetze, schatten, opfer, zufall }) {
  const pS = idx(plaetze[schatten]), pO = idx(plaetze[opfer])
  const liste = []
  if (pS === pO) liste.push(`Die Tintenspur endet gleich neben dem Platz von ${opfer}, ${bei(plaetze[opfer])}. Wer dort stand, war nah dran.`)
  else liste.push(`Eine Tintenspur führt vom Platz von ${opfer} (${bei(plaetze[opfer])}) ${pS < pO ? 'Richtung Tür' : 'Richtung Fenster'}.`)
  const weg = durchquert(plaetze[schatten], plaetze[opfer])
  if (weg.length) liste.push(`Kreidestaub ${bei(zufall.aus(weg))}, als wäre jemand nur durchgegangen.`)
  return liste
}

// Zufaelliges Tagesereignis (hoechstens eines): zettel = wahrer Hinweis, hausmeister = nur eine
// Gespraechsrunde, glocke = geheime Abstimmung. null = ruhiger Tag.
export function tagesereignis({ plaetze, schatten, zufall }) {
  const w = zufall.zahl()
  if (w < 0.35) {
    const falsch = zufall.aus(ORT_NAMEN.filter((o) => o !== plaetze[schatten]))
    return { art: 'zettel', text: `Der Schatten stand heute Nacht nicht ${bei(falsch)}.` }
  }
  if (w < 0.55) return { art: 'hausmeister', text: 'Der Hausmeister rüttelt an der Klinke. Heute bleibt nur eine Gesprächsrunde.' }
  if (w < 0.75) return { art: 'glocke', text: 'Die Schulglocke hat geläutet, obwohl niemand sie berührt hat. Heute wird geheim abgestimmt.' }
  return null
}

// Was eine Untersuchung ergibt. ort = Ortsname oder KLASSENBUCH.
export function untersuchung({ ort, plaetze, schatten, opfer, wer, zufall }) {
  if (ort === KLASSENBUCH) {
    const namen = Object.keys(plaetze).filter((n) => n !== wer)
    const n = zufall.aus(namen)
    return `Im Klassenbuch steht in fremder Handschrift: „${n} – ${plaetze[n]}.“`
  }
  const dort = Object.keys(plaetze).filter((n) => plaetze[n] === ort)
  const teile = []
  teile.push(dort.length ? `Hier ${dort.length === 1 ? 'stand' : 'standen'} letzte Nacht ${dort.join(' und ')}.` : 'Hier stand letzte Nacht niemand.')
  if (durchquert(plaetze[schatten], plaetze[opfer]).includes(ort)) teile.push('Dazu Tintenpunkte am Boden, als wäre jemand nur durchgegangen.')
  return teile.join(' ')
}
