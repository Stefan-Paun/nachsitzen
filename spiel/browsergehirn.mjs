// Das Gehirn des Menschen im Browser: jede Entscheidung ist ein Versprechen, das der Server
// einloest, sobald die passende Aktion per POST /aktion ankommt. Ungueltige Aktionen werden
// hier abgewiesen, damit die Spielschleife nie an einer Mensch-Eingabe scheitert.

import { SCHATTEN, SCHLUESSEL } from './rollen.mjs'
import { behauptungAus } from './welt.mjs'

export function browserGehirn(name, rolle, { sende }) {
  let offen = null          // { was, loese, weise }

  const frage = (was) => new Promise((loese, weise) => {
    offen = { was, loese, weise }
    sende('warte', was)
  })
  const andere = (lebende) => lebende.filter((n) => n !== name)

  return {
    name, rolle,
    abend: (sicht, lebende) => frage({ art: 'sagen', pflicht: true, andere: andere(lebende) }),
    diskussion: (sicht, lebende) => frage({ art: 'sagen', pflicht: false, andere: andere(lebende) }),
    nacht: (sicht, lebende, { orte, ziele }) => frage({ art: 'nacht', aufgabe: rolle === SCHATTEN ? 'holen' : rolle === SCHLUESSEL ? 'pruefen' : 'verstecken', orte, optionen: ziele ?? andere(lebende) }),
    untersuchen: (sicht, lebende, { orte }) => frage({ art: 'untersuchen', orte }),
    zeigen: (sicht, lebende, { ergebnis }) => frage({ art: 'zeigen', ergebnis: ergebnis.text }),
    abstimmung: (sicht, lebende) => frage({ art: 'stimme', optionen: andere(lebende) }),
    merkePruefung() {},

    wartetAuf: () => offen?.was ?? null,

    // Liefert null bei Erfolg, sonst eine Fehlermeldung fuer den Browser.
    aktion(a) {
      if (!offen) return 'Gerade ist keine Eingabe gefragt'
      const { was } = offen
      let ergebnis
      if (was.art === 'sagen') {
        const text = String(a.text || '').trim().slice(0, 300)
        if (a.art === 'schweigt' || !text) {
          if (was.pflicht) return 'Sag zumindest einen Satz'
          ergebnis = { art: 'schweigt' }
        } else {
          if (a.an && !was.andere.includes(a.an)) return `${a.an} ist nicht im Raum. Ansprechen kannst du: ${was.andere.join(', ')} (oder niemanden)`
          ergebnis = { art: 'sagt', text, an: was.andere.includes(a.an) ? a.an : null, behauptet: behauptungAus(text) }
        }
      } else if (was.art === 'nacht') {
        if (!was.orte.includes(a.platz)) return `${a.platz ? `„${a.platz}“ ist kein Platz` : 'Du brauchst einen Platz'}. Plätze: ${was.orte.join(', ')}`
        if (was.aufgabe !== 'verstecken' && !was.optionen.includes(a.ziel)) return `${a.ziel ? `${a.ziel} kannst du heute nicht ${was.aufgabe === 'holen' ? 'holen' : 'prüfen'}` : `Du musst auch sagen, wen du ${was.aufgabe === 'holen' ? 'holst' : 'prüfst'}`}. Möglich: ${was.optionen.join(', ')}`
        ergebnis = { platz: a.platz, ziel: was.aufgabe === 'verstecken' ? undefined : a.ziel }
      } else if (was.art === 'untersuchen') {
        if (a.ort != null && !was.orte.includes(a.ort)) return `„${a.ort}“ kannst du nicht untersuchen. Möglich: ${was.orte.join(', ')} oder nichts`
        ergebnis = a.ort ? { ort: a.ort } : null
      } else if (was.art === 'zeigen') {
        ergebnis = !!a.zeigen
      } else if (was.art === 'stimme') {
        if (a.fuer != null && !was.optionen.includes(a.fuer)) return `${a.fuer} steht nicht zur Wahl (nicht im Raum oder du selbst). Möglich: ${was.optionen.join(', ')} oder niemand`
        ergebnis = { fuer: a.fuer ?? null }
      } else return 'Unbekannte Eingabe'
      const { loese } = offen
      offen = null
      sende('warte', null)
      loese(ergebnis)
      return null
    },

    abbrechen() {
      if (!offen) return
      const { weise } = offen
      offen = null
      weise(new Error('Partie abgebrochen'))
    },
  }
}
