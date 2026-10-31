// Die Spielschleife: treibt eine Partie mit beliebigen Gehirnen (Skript, Claude, Mensch) bis zum Ende.
// Gehirne duerfen synchron oder async sein. `beobachter` bekommt jedes neue Ereignis (fuer Terminal/Browser).

import * as P from './partie.mjs'

export async function spieleBisZumEnde(p, gehirne, { zufall, beobachter = () => {}, pause = async () => {} } = {}) {
  let gesehen = 0
  const melde = () => { for (; gesehen < p.ereignisse.length; gesehen++) beobachter(p.ereignisse[gesehen], p) }
  const sicht = (n) => P.verlaufFuer(p, n)
  melde()

  if (p.phase === 'abend') {
    for (const n of zufall.mischen(p.lebende)) {
      const a = await gehirne[n].abend(sicht(n), p.lebende)
      P.sprechen(p, n, a.text, a.an ?? null); melde(); await pause()
    }
    P.abendBeenden(p); melde()
  }

  while (p.phase !== 'ende') {
    if (p.phase === 'nacht') {
      const s = P.schatten(p), k = P.schluesseltraeger(p)
      const wahl = await gehirne[s].nacht(sicht(s), p.lebende)
      P.schattenWaehlt(p, wahl.ziel)
      if (P.lebt(p, k)) {
        const pr = await gehirne[k].nacht(sicht(k), p.lebende)
        gehirne[k].merkePruefung?.(pr.ziel, P.schluesselPrueft(p, pr.ziel))
      }
      P.morgen(p); melde(); await pause()
      if (p.phase === 'ende') break
    }
    if (p.phase === 'diskussion') {
      while (p.phase === 'diskussion') {
        for (const n of zufall.mischen(p.lebende)) {
          if (p.phase !== 'diskussion') break
          const a = await gehirne[n].diskussion(sicht(n), p.lebende)
          if (a.art === 'schweigt') P.schweigen(p, n); else P.sprechen(p, n, a.text, a.an ?? null)
          melde(); await pause()
        }
        P.naechsteRunde(p); melde()
      }
    }
    if (p.phase === 'abstimmung') {
      for (const n of zufall.mischen(p.lebende)) {
        const a = await gehirne[n].abstimmung(sicht(n), p.lebende)
        if (a.begruendung) { P.sprechen(p, n, a.begruendung, a.fuer ?? null) }
        P.stimme(p, n, a.fuer ?? null); melde(); await pause()
      }
      P.abstimmungSchliessen(p); melde()
    }
  }
  return p
}
