// Die Spielschleife: treibt eine Partie mit beliebigen Gehirnen (Skript, Claude, Mensch) bis zum Ende.
// Gehirne duerfen synchron oder async sein. `beobachter` bekommt jedes neue Ereignis (fuer Terminal/Browser).
//
// Gehirn-Schnittstelle (alle mit (sicht, lebende[, extra])):
//   abend -> { text, an }            diskussion -> { art: 'sagt'|'schweigt', text?, an? }
//   nacht -> { platz, ziel? }        (Schatten: ziel = wen holen; Schluesseltraeger: ziel = wen pruefen)
//   untersuchen -> { ort } | null    (Ort oder 'Klassenbuch', einmal pro Tag, nur Runde 1)
//   abstimmung -> { fuer, begruendung? }

import * as P from './partie.mjs'
import { ORT_NAMEN, KLASSENBUCH, behauptungAus } from './welt.mjs'

export async function spieleBisZumEnde(p, gehirne, { zufall, beobachter = () => {}, pause = async () => {} } = {}) {
  let gesehen = 0
  const melde = () => { for (; gesehen < p.ereignisse.length; gesehen++) beobachter(p.ereignisse[gesehen], p) }
  const sicht = (n) => P.verlaufFuer(p, n)
  melde()

  if (p.phase === 'abend') {
    for (const n of zufall.mischen(p.lebende)) {
      const a = await gehirne[n].abend(sicht(n), p.lebende)
      P.sprechen(p, n, a.text, a.an ?? null, a.behauptet ?? behauptungAus(a.text)); melde(); await pause()
    }
    P.abendBeenden(p); melde()
  }

  while (p.phase !== 'ende') {
    if (p.phase === 'nacht') {
      const s = P.schatten(p), k = P.schluesseltraeger(p)
      for (const n of zufall.mischen(p.lebende)) {
        const a = await gehirne[n].nacht(sicht(n), p.lebende, { orte: ORT_NAMEN })
        P.platzWaehlen(p, n, a.platz)
        if (n === s) P.schattenWaehlt(p, a.ziel)
        else if (n === k) gehirne[k].merkePruefung?.(a.ziel, P.schluesselPrueft(p, a.ziel))
        melde()
      }
      P.morgen(p); melde(); await pause()
      if (p.phase === 'ende') break
    }
    if (p.phase === 'diskussion') {
      // Runde 1 beginnt mit den Untersuchungen
      for (const n of zufall.mischen(p.lebende)) {
        const u = await gehirne[n].untersuchen?.(sicht(n), p.lebende, { orte: [...ORT_NAMEN, KLASSENBUCH] })
        if (u?.ort) { P.untersuchen(p, n, u.ort); melde(); await pause() }
      }
      while (p.phase === 'diskussion') {
        for (const n of zufall.mischen(p.lebende)) {
          if (p.phase !== 'diskussion') break
          const a = await gehirne[n].diskussion(sicht(n), p.lebende)
          if (a.art === 'schweigt') P.schweigen(p, n); else P.sprechen(p, n, a.text, a.an ?? null, a.behauptet ?? behauptungAus(a.text))   // Rueckfall: Platz aus dem Satz lesen
          melde(); await pause()
        }
        P.naechsteRunde(p); melde()
      }
    }
    if (p.phase === 'abstimmung') {
      for (const n of zufall.mischen(p.lebende)) {
        const a = await gehirne[n].abstimmung(sicht(n), p.lebende)
        if (a.begruendung && !p.geheimeAbstimmung) P.sprechen(p, n, a.begruendung, a.fuer ?? null)
        P.stimme(p, n, a.fuer ?? null); melde(); await pause()
      }
      P.abstimmungSchliessen(p); melde()
    }
  }
  return p
}
