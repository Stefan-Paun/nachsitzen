// Die Welt hinter dem Gerede: Orte im Klassenzimmer, wo nachts wirklich wer stand, welche Spuren
// der Schatten hinterlaesst und was jede Figur davon mitbekommt. Alles hier ist WAHR; die Figuren
// bekommen nur Ausschnitte. Reine Funktionen, deterministisch mit dem Zufall der Partie.
// Jede Beobachtung, jeder Fund traegt neben dem Text auch Felder (typ, ort, name, richtung),
// damit der Browser daraus die Spurentafel bauen kann.

export const ORTE = [
  { name: 'Tür', bei: 'bei der Tür', detail: 'die alte Flügeltür, Klinke eiskalt, das Schlüsselloch leer', staub: 'Kreidestaub auf der Türschwelle, ein halber Schuhabdruck darin' },
  { name: 'Tafel', bei: 'an der Tafel', detail: 'die Tafel mit einem halb gewischten Satz, die Kreide in der Rinne zerbrochen', staub: 'Kreidestaub vor der Tafel, verwischt, als wäre jemand schnell vorbei' },
  { name: 'Pulte', bei: 'bei den Pulten', detail: 'die mittleren Pultreihen, zerkratztes Holz, in jedem Pult ein Tintenfass', staub: 'Kreidestaub zwischen den Pultreihen, ein Stuhl steht schief' },
  { name: 'Fenster', bei: 'am Fenster', detail: 'die hohen Fenster zum Hof, Riegel verrostet, der Vorhang bewegt sich ohne Wind', staub: 'Kreidestaub auf der Fensterbank, daneben ein feuchter Fleck' },
]
export const ORT_NAMEN = ORTE.map((o) => o.name)
export const KLASSENBUCH = 'Klassenbuch'
export const bei = (ort) => ORTE.find((o) => o.name === ort)?.bei ?? ort
const idx = (ort) => ORT_NAMEN.indexOf(ort)
const RICHTUNG = { tuer: 'Richtung Tür', fenster: 'Richtung Fenster' }

export function istOrt(ort) { return ORT_NAMEN.includes(ort) }

// Orte, die der Schatten auf dem Weg vom eigenen Platz zum Opfer durchquert (ohne Start und Ziel).
export function durchquert(von, nach) {
  const a = idx(von), b = idx(nach)
  if (a < 0 || b < 0 || Math.abs(a - b) < 2) return []
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return ORT_NAMEN.slice(lo + 1, hi)
}

// Was jede Figur in dieser Nacht mitbekommt. plaetze: { name: ort }, schatten/opfer: Namen.
// Liefert { name: [beobachtung, ...] } fuer alle Lebenden ausser dem Opfer. Jede Zeile ist wahr.
export function beobachtungen({ plaetze, lebende, schatten, opfer, zufall }) {
  const erg = {}
  const pS = idx(plaetze[schatten])
  for (const a of lebende) {
    if (a === opfer) continue
    const zeilen = []
    const andere = lebende.filter((n) => n !== a)
    const pA = idx(plaetze[a])
    const gesehen = (b) => ({ typ: 'gesehen', name: b, ort: plaetze[b], text: `Du hast gesehen: ${b} stand ${bei(plaetze[b])}.` })
    // Wer am selben Platz steht, wird eher gesehen
    const nahe = andere.filter((n) => plaetze[n] === plaetze[a])
    if (nahe.length && zufall.zahl() < 0.75) zeilen.push(gesehen(zufall.aus(nahe)))
    else if (zufall.zahl() < 0.55) zeilen.push(gesehen(zufall.aus(andere)))
    if (a !== schatten) {
      if (Math.abs(pA - pS) <= 1 && zufall.zahl() < 0.5) {
        zeilen.push(pA === pS
          ? { typ: 'bewegung', ort: plaetze[schatten], text: 'Jemand direkt neben dir ist eine Weile weg gewesen und leise zurückgekommen.' }
          : { typ: 'bewegung', ort: plaetze[schatten], text: `Es hat sich jemand ${bei(plaetze[schatten])} bewegt, ganz in deiner Nähe.` })
      }
      if (zufall.zahl() < 0.5) {
        const richtung = pS === pA ? 'nah' : pS < pA ? 'tuer' : 'fenster'
        zeilen.push({ typ: 'schritte', richtung, text: richtung === 'nah' ? 'Schritte, ganz nah bei dir, dann Stille.' : `Schritte, ${richtung === 'tuer' ? 'von der Türseite her' : 'von der Fensterseite her'}, ein Knarren, dann nichts mehr.` })
      }
    }
    if (!zeilen.length) zeilen.push(gesehen(zufall.aus(andere)))
    erg[a] = zeilen
  }
  return erg
}

// Oeffentliche Fundstuecke am Morgen, aus dem echten Weg des Schattens.
export function funde({ plaetze, schatten, opfer, zufall }) {
  const pS = idx(plaetze[schatten]), pO = idx(plaetze[opfer])
  const ortO = plaetze[opfer]
  const liste = []
  if (pS === pO) liste.push({ typ: 'spur', ort: ortO, richtung: 'hier', text: `Die Tintenspur macht nur einen kleinen Bogen: Sie beginnt am Platz von ${opfer} (${bei(ortO)}) und endet gleich daneben. Wer dort stand, war nah dran.` })
  else {
    const r = pS < pO ? 'tuer' : 'fenster'
    liste.push({ typ: 'spur', ort: ortO, richtung: r, text: `Eine Tintenspur führt vom Platz von ${opfer} (${bei(ortO)}) ${RICHTUNG[r]}, erst dick, dann nur noch Tropfen.` })
  }
  const weg = durchquert(plaetze[schatten], plaetze[opfer])
  if (weg.length) { const o = zufall.aus(weg); liste.push({ typ: 'staub', ort: o, text: `${ORTE[idx(o)].staub}.` }) }
  // Letzte Notiz: ein halber Satz, den das Opfer noch hingekritzelt hat (wahr, aber unscharf)
  if (zufall.zahl() < 0.4) {
    const seite = pS === pO ? 'direkt neben mir' : pS < pO ? 'von der Tür her' : 'vom Fenster her'
    liste.push({ typ: 'notiz', richtung: pS === pO ? 'hier' : pS < pO ? 'tuer' : 'fenster', text: `Unter dem Tintenfleck ein halb zerrissener Zettel in der Handschrift von ${opfer}: „…kommt ${seite}, ich glaub es ist…“` })
  }
  return liste
}

// Zufaelliges Tagesereignis (hoechstens eines): zettel = wahrer Hinweis, hausmeister = nur eine
// Gespraechsrunde, glocke = geheime Abstimmung. null = ruhiger Tag.
export function tagesereignis({ plaetze, schatten, zufall }) {
  const w = zufall.zahl()
  if (w < 0.35) {
    const falsch = zufall.aus(ORT_NAMEN.filter((o) => o !== plaetze[schatten]))
    return { art: 'zettel', ort: falsch, text: `Der Schatten stand heute Nacht nicht ${bei(falsch)}.` }
  }
  if (w < 0.55) return { art: 'hausmeister', text: 'Der Hausmeister rüttelt draußen an der Klinke und flucht. Heute bleibt nur eine Gesprächsrunde.' }
  if (w < 0.75) return { art: 'glocke', text: 'Die Schulglocke läutet, obwohl niemand sie berührt hat. Heute wird geheim abgestimmt.' }
  return null
}

// Was eine Untersuchung ergibt. ort = Ortsname oder KLASSENBUCH.
export function untersuchung({ ort, plaetze, schatten, opfer, wer, zufall }) {
  if (ort === KLASSENBUCH) {
    const namen = Object.keys(plaetze).filter((n) => n !== wer)
    const n = zufall.aus(namen)
    return { ort: KLASSENBUCH, name: n, platz: plaetze[n], text: `Im Klassenbuch steht in fremder Handschrift, die Tinte noch feucht: „${n} – ${plaetze[n]}.“` }
  }
  const dort = Object.keys(plaetze).filter((n) => plaetze[n] === ort)
  const durchgang = durchquert(plaetze[schatten], plaetze[opfer]).includes(ort)
  const teile = [`${ORTE[idx(ort)].detail.charAt(0).toUpperCase()}${ORTE[idx(ort)].detail.slice(1)}.`]
  teile.push(dort.length ? `Hier ${dort.length === 1 ? 'stand' : 'standen'} letzte Nacht ${dort.join(' und ')}.` : 'Hier stand letzte Nacht niemand.')
  if (durchgang) teile.push('Dazu Tintenpunkte am Boden, als wäre jemand nur durchgegangen.')
  return { ort, namen: dort, durchgang, text: teile.join(' ') }
}
