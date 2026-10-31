// Skript-Gehirne: feste Strategien statt Claude. Damit laufen Partien ohne API-Kosten
// durch - fuer Regeltests, Siegquoten und die Simulation. Dieselbe Schnittstelle bekommt
// spaeter das Claude-Gehirn: entscheide(figur, sicht) -> Aktion.

import { SCHATTEN } from '../spiel/rollen.mjs'

// Wie oft hat jemand jemanden beschuldigt? (aus dem, was die Figur hoeren konnte)
function beschuldigungen(sicht) {
  const z = {}
  for (const e of sicht) if (e.art === 'sagt' && e.an && /schatten|luegst|warst nicht|verdaechtig/i.test(e.text)) z[e.an] = (z[e.an] || 0) + 1
  return z
}

function lauteste(sicht, kandidaten) {
  const z = {}
  for (const e of sicht) if (e.art === 'sagt') z[e.von] = (z[e.von] || 0) + 1
  return [...kandidaten].sort((a, b) => (z[b] || 0) - (z[a] || 0))[0]
}

export function skriptGehirn(name, rolle, zufall) {
  const geprueft = {}             // nur der Schluesseltraeger fuellt das
  return {
    name,
    abend(sicht, lebende) {
      return { art: 'sagt', text: zufall.aus(['Ist jemand bei der Tuer gewesen?', 'Mir ist kalt.', 'Wer hat das Licht gesehen?', 'Ich war die ganze Zeit hier.']) }
    },
    nacht(sicht, lebende) {
      const andere = lebende.filter((n) => n !== name)
      if (rolle === SCHATTEN) return { art: 'holen', ziel: lauteste(sicht, andere) }
      const offen = andere.filter((n) => !(n in geprueft))
      return { art: 'pruefen', ziel: offen.length ? zufall.aus(offen) : zufall.aus(andere) }
    },
    merkePruefung(ziel, istSchatten) { geprueft[ziel] = istSchatten },
    diskussion(sicht, lebende) {
      const andere = lebende.filter((n) => n !== name)
      const bekannt = Object.entries(geprueft).find(([n, s]) => s && lebende.includes(n))
      if (bekannt) return { art: 'sagt', an: bekannt[0], text: `Ich habe nachts nachgesehen: ${bekannt[0]} ist der Schatten.` }
      if (zufall.zahl() < 0.4) return { art: 'schweigt' }
      const ziel = rolle === SCHATTEN ? zufall.aus(andere) : (Object.entries(beschuldigungen(sicht)).filter(([n]) => andere.includes(n)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? zufall.aus(andere))
      return { art: 'sagt', an: ziel, text: `${ziel}, du warst nicht an deinem Platz.` }
    },
    abstimmung(sicht, lebende) {
      const andere = lebende.filter((n) => n !== name)
      const bekannt = Object.entries(geprueft).find(([n, s]) => s && lebende.includes(n))
      if (bekannt) return { art: 'stimme', fuer: bekannt[0] }
      const b = beschuldigungen(sicht)
      const sauber = andere.filter((n) => geprueft[n] !== false)
      const reihe = (sauber.length ? sauber : andere).sort((x, y) => (b[y] || 0) - (b[x] || 0))
      if (rolle === SCHATTEN) return { art: 'stimme', fuer: reihe.find((n) => (b[n] || 0) > 0) ?? zufall.aus(andere) }
      return { art: 'stimme', fuer: (b[reihe[0]] || 0) > 0 ? reihe[0] : (zufall.zahl() < 0.3 ? null : zufall.aus(reihe)) }
    },
  }
}
