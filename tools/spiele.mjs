// Eine echte Partie im Terminal, mit Claude-Figuren. Du bist Stefan und tippst selbst.
//   node tools/spiele.mjs                 du spielst mit
//   node tools/spiele.mjs --zuschauen     sechs KI-Figuren, du schaust zu (Rollen werden gezeigt)
//   node tools/spiele.mjs --name Anna     anderer Spielername
// Kostet echtes Geld (Cent-Betraege); der Tagesdeckel steht in spiel/kosten.mjs.

import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { spieleBisZumEnde } from '../spiel/schleife.mjs'
import { claudeGehirn, ladeFigur, verlaufAlsText } from '../spiel/gehirn.mjs'
import { claudeAnfrage } from '../spiel/claude.mjs'
import { apiSchluessel } from '../spiel/schluessel.mjs'
import { kostenRechner } from '../spiel/kosten.mjs'
import { SCHATTEN, SCHLUESSEL } from '../spiel/rollen.mjs'

const argv = process.argv.slice(2)
const zuschauen = argv.includes('--zuschauen')
const spieler = zuschauen ? null : (argv[argv.indexOf('--name') + 1] || 'Stefan')
const KI = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora']
const namen = zuschauen ? [...KI, 'Sam'] : [...KI, spieler]

const rl = readline.createInterface({ input: stdin, output: stdout })
const z = zufall()
const kosten = kostenRechner()
const anfrage = claudeAnfrage({ schluessel: apiSchluessel(), kosten, log: (m) => console.log(`  (${m})`) })
const p = P.neuePartie(namen, z, { spieler })

const ROLLE = { [SCHATTEN]: 'der Schatten', [SCHLUESSEL]: 'der Schlüsselträger', schueler: 'ein normaler Schüler' }

// Mensch-Gehirn: liest aus dem Terminal
function menschGehirn(name) {
  const frageName = async (text, andere, mitNiemand = false) => {
    for (;;) {
      const a = (await rl.question(`${text} [${[...andere, ...(mitNiemand ? ['niemand'] : [])].join('/')}] `)).trim()
      const t = andere.find((n) => n.toLowerCase() === a.toLowerCase())
      if (t) return t
      if (mitNiemand && /^(niemand|-|)$/i.test(a)) return null
    }
  }
  const rede = async () => {
    const t = (await rl.question('Du: ')).trim()
    if (!t) return { art: 'schweigt' }
    const an = namen.find((n) => n !== name && new RegExp(`^${n}\\b`, 'i').test(t))
    return { art: 'sagt', text: t, an: an || null }
  }
  return {
    name,
    abend: async () => { const a = await rede(); return a.art === 'schweigt' ? { art: 'sagt', text: '…', an: null } : a },
    diskussion: rede,
    nacht: async (sicht, lebende) => {
      const andere = lebende.filter((n) => n !== name)
      const r = p.rollen[name]
      const ziel = await frageName(r === SCHATTEN ? 'Wen holst du heute Nacht?' : 'Wen prüfst du heute Nacht?', andere)
      return { art: r === SCHATTEN ? 'holen' : 'pruefen', ziel }
    },
    abstimmung: async (sicht, lebende) => ({ art: 'stimme', fuer: await frageName('Wer soll in den Keller?', lebende.filter((n) => n !== name), true), begruendung: '' }),
    merkePruefung(ziel, ist) { console.log(`  → Du hast ${ziel} geprüft: ${ist ? 'DER SCHATTEN.' : 'kein Schatten.'}`) },
  }
}

const gehirne = {}
for (const n of namen) {
  gehirne[n] = n === spieler ? menschGehirn(n)
    : claudeGehirn(n === 'Sam' ? { name: 'Sam', alter: 17, beschreibung: 'Neu in der Klasse, freundlich, etwas zu vertrauensselig.', stil: 'Höflich, fragt viel.', beispiele: ['Sorry, wer von euch war das nochmal beim Fenster?'] } : ladeFigur(n),
      p.rollen[n], { anfrage, mitspieler: namen, spieler, zufall: z, log: (m) => console.log(`  (${m})`) })
}

console.log('\n=== NACHSITZEN ===')
if (spieler) console.log(`Du bist ${spieler}. Deine Rolle: ${ROLLE[p.rollen[spieler]]}.`)
else for (const n of namen) console.log(`  ${n}: ${ROLLE[p.rollen[n]]}`)
console.log('(Abstimmung: Name tippen oder leer lassen. Eine Nachricht beginnt mit einem Namen, um jemanden direkt anzusprechen.)\n')

const sichtbar = (e) => zuschauen || e.fuer.includes(spieler)
let letztePhase = null
const beobachter = (e) => {
  if (!sichtbar(e) || e.art === 'rolle') return
  if (e.art === 'ende') {
    console.log(`\n=== ENDE: ${e.sieger === 'schueler' ? 'Die Schüler haben gewonnen' : 'Der Schatten hat gewonnen'}. Der Schatten war ${e.schatten}. ===`)
    return
  }
  const zeile = verlaufAlsText([e], spieler ?? '')
  if (zeile) console.log(zeile)
  if (e.phase !== letztePhase && e.art === 'nacht') console.log('')
  letztePhase = e.phase
}

try {
  await spieleBisZumEnde(p, gehirne, { zufall: z, beobachter, pause: () => new Promise((f) => setTimeout(f, 250)) })
} finally {
  const t = kosten.heute()
  console.log(`\nHeute: ${t.aufrufe} Aufrufe, ${(t.dollar * 100).toFixed(1)} Cent.`)
  rl.close()
}
