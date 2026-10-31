// Das Gehirn des Menschen im Browser: jede Entscheidung ist ein Versprechen, das der Server
// einloest, sobald die passende Aktion per POST /aktion ankommt. Ungueltige Aktionen werden
// hier abgewiesen, damit die Spielschleife nie an einer Mensch-Eingabe scheitert.

import { SCHATTEN } from './rollen.mjs'

export function browserGehirn(name, rolle, { sende }) {
  let offen = null          // { was, loese, weise }

  const frage = (was) => new Promise((loese, weise) => {
    offen = { was, loese, weise }
    sende('warte', was)
  })

  return {
    name, rolle,
    abend: (sicht, lebende) => frage({ art: 'sagen', pflicht: true, andere: lebende.filter((n) => n !== name) }),
    diskussion: (sicht, lebende) => frage({ art: 'sagen', pflicht: false, andere: lebende.filter((n) => n !== name) }),
    nacht: (sicht, lebende) => frage({ art: rolle === SCHATTEN ? 'holen' : 'pruefen', optionen: lebende.filter((n) => n !== name) }),
    abstimmung: (sicht, lebende) => frage({ art: 'stimme', optionen: lebende.filter((n) => n !== name) }),
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
          ergebnis = { art: 'sagt', text, an: was.andere.includes(a.an) ? a.an : null }
        }
      } else if (was.art === 'holen' || was.art === 'pruefen') {
        if (!was.optionen.includes(a.ziel)) return 'Ungueltiges Ziel'
        ergebnis = { art: was.art, ziel: a.ziel }
      } else if (was.art === 'stimme') {
        if (a.fuer != null && !was.optionen.includes(a.fuer)) return 'Ungueltige Stimme'
        ergebnis = { art: 'stimme', fuer: a.fuer ?? null, begruendung: String(a.begruendung || '').trim().slice(0, 200) }
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
