// Skript-Gehirne: feste Strategien statt Claude. Damit laufen Partien ohne API-Kosten
// durch - fuer Regeltests, Siegquoten und die Simulation. Dieselbe Schnittstelle bekommt
// das Claude-Gehirn (siehe spiel/schleife.mjs).

import { SCHATTEN, SCHLUESSEL, PETZE } from '../spiel/rollen.mjs'
import { KLASSENBUCH, bei } from '../spiel/welt.mjs'

// Wie oft hat jemand jemanden beschuldigt? (aus dem, was die Figur hoeren konnte)
function beschuldigungen(sicht) {
  const z = {}
  for (const e of sicht) if (e.art === 'sagt' && e.an && /schatten|lügst|warst nicht|verdächtig|passt nicht/i.test(e.text)) z[e.an] = (z[e.an] || 0) + 1
  return z
}

function lauteste(sicht, kandidaten) {
  const z = {}
  for (const e of sicht) if (e.art === 'sagt') z[e.von] = (z[e.von] || 0) + 1
  return [...kandidaten].sort((a, b) => (z[b] || 0) - (z[a] || 0))[0]
}

// mitPetze: gibt es in dieser Partie eine Petze? (Nur dann darf sich der Schatten als Petze ausgeben.)
export function skriptGehirn(name, rolle, zufall, { mitPetze = true } = {}) {
  const geprueft = {}             // nur Schluesseltraeger und Petze fuellen das: Name -> ist Schatten
  const gesehen = {}              // nur die Petze: Name -> Rolle, die sie erfahren hat
  let meinPlatz = null
  return {
    name,
    abend(sicht, lebende) {
      return { text: zufall.aus(['Ist jemand bei der Tür gewesen?', 'Mir ist kalt.', 'Wer hat das Licht gesehen?', 'Ich war die ganze Zeit hier.']) }
    },
    nacht(sicht, lebende, { orte, ziele }) {
      const andere = lebende.filter((n) => n !== name)
      meinPlatz = zufall.aus(orte)
      if (rolle === SCHATTEN) return { platz: meinPlatz, ziel: lauteste(sicht, ziele ?? andere) }
      if (rolle === SCHLUESSEL) {
        const offen = andere.filter((n) => !(n in geprueft))
        return { platz: meinPlatz, ziel: offen.length ? zufall.aus(offen) : zufall.aus(andere) }
      }
      if (rolle === PETZE) {
        // Verdaechtige zuerst: wer am meisten beschuldigt wurde, sonst irgendwer Ungeprueftes
        const offen = andere.filter((n) => !(n in gesehen))
        const b = beschuldigungen(sicht)
        const reihe = [...offen].sort((x, y) => (b[y] || 0) - (b[x] || 0))
        return { platz: meinPlatz, ziel: reihe.length ? ((b[reihe[0]] || 0) > 0 ? reihe[0] : zufall.aus(reihe)) : zufall.aus(andere) }
      }
      return { platz: meinPlatz }
    },
    merkePruefung(ziel, istSchatten) { geprueft[ziel] = istSchatten },
    merkePetze(ziel, gefundeneRolle) { gesehen[ziel] = gefundeneRolle; geprueft[ziel] = gefundeneRolle === SCHATTEN },
    untersuchen(sicht, lebende, { orte }) {
      if (zufall.zahl() < 0.3) return null
      // Lieber dort nachsehen, wo der letzte Fund hinzeigt, sonst irgendwo
      const fund = [...sicht].reverse().find((e) => e.art === 'fund')
      const treffer = fund && orte.find((o) => fund.text.includes(o))
      return { ort: treffer && zufall.zahl() < 0.6 ? treffer : (zufall.zahl() < 0.25 ? KLASSENBUCH : zufall.aus(orte.filter((o) => o !== KLASSENBUCH))) }
    },
    zeigen(sicht, lebende, { ergebnis }) { return rolle !== SCHATTEN && (ergebnis.namen?.length > 0 || ergebnis.durchgang) && zufall.zahl() < 0.6 },
    diskussion(sicht, lebende) {
      const andere = lebende.filter((n) => n !== name)
      const bekannt = Object.entries(geprueft).find(([n, s]) => s && lebende.includes(n))
      if (bekannt) return { art: 'sagt', an: bekannt[0], text: rolle === PETZE ? `Ich bin die Petze, ich habe ${bekannt[0]} nachts durchschaut: ${bekannt[0]} ist der Schatten.` : `Ich habe nachts nachgesehen: ${bekannt[0]} ist der Schatten.` }
      // Der Schatten gibt sich manchmal als Petze aus und beschuldigt jemand anderen
      if (rolle === SCHATTEN && mitPetze && andere.length && zufall.zahl() < 0.12) { const o = zufall.aus(andere); return { art: 'sagt', an: o, text: `Ich bin die Petze, ich habe ${o} nachts durchschaut: ${o} ist der Schatten.` } }
      if (zufall.zahl() < 0.4) return { art: 'schweigt' }
      if (meinPlatz && zufall.zahl() < 0.3) return { art: 'sagt', an: null, text: `Ich war ${bei(rolle === SCHATTEN ? 'Tür' : meinPlatz)}, die ganze Nacht.` }   // der Skript-Schatten luegt immer 'Tuer'
      const ziel = rolle === SCHATTEN ? zufall.aus(andere) : (Object.entries(beschuldigungen(sicht)).filter(([n]) => andere.includes(n)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? zufall.aus(andere))
      return { art: 'sagt', an: ziel, text: `${ziel}, du warst nicht an deinem Platz.` }
    },
    abstimmung(sicht, lebende) {
      const andere = lebende.filter((n) => n !== name)
      const bekannt = Object.entries(geprueft).find(([n, s]) => s && lebende.includes(n))
      if (bekannt) return { fuer: bekannt[0] }
      const b = beschuldigungen(sicht)
      const sauber = andere.filter((n) => geprueft[n] !== false)
      const reihe = (sauber.length ? sauber : andere).sort((x, y) => (b[y] || 0) - (b[x] || 0))
      if (rolle === SCHATTEN) return { fuer: reihe.find((n) => (b[n] || 0) > 0) ?? zufall.aus(andere) }
      return { fuer: (b[reihe[0]] || 0) > 0 ? reihe[0] : (zufall.zahl() < 0.3 ? null : zufall.aus(reihe)) }
    },
  }
}
