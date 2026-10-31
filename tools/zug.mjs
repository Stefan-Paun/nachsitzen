// Nachsitzen von der Kommandozeile aus mitspielen (fuer Tests und Agenten, ohne Browser).
//   node tools/zug.mjs <port> --neu [Name]            neue Partie als Mensch starten
//   node tools/zug.mjs <port>                         neue Ereignisse zeigen + worauf das Spiel wartet
//   node tools/zug.mjs <port> --sagen "Text" [--an Name]
//   node tools/zug.mjs <port> --schweigen
//   node tools/zug.mjs <port> --platz Tür [--ziel Mira]   (Nacht; Ziel nur fuer Schatten/Schluesseltraeger)
//   node tools/zug.mjs <port> --untersuchen Tafel|Klassenbuch|nichts
//   node tools/zug.mjs <port> --stimme Nora|niemand
//   node tools/zug.mjs <port> --hefte                 nach dem Ende: die Hefte der Figuren
// Jeder Aufruf druckt danach, was seit dem letzten Aufruf passiert ist (aus Sicht des Spielers).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verlaufAlsText } from '../spiel/gehirn.mjs'

const [port, ...rest] = process.argv.slice(2)
if (!port) { console.error('Port fehlt'); process.exit(2) }
const basis = `http://127.0.0.1:${port}`
const merker = path.join(os.tmpdir(), `nachsitzen-zug-${port}.json`)
const arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : true) : null }
const json = (r) => r.json()
const post = (pfad, body) => fetch(basis + pfad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(json)
const schlaf = (ms) => new Promise((f) => setTimeout(f, ms))

let ab = 0
try { ab = JSON.parse(fs.readFileSync(merker, 'utf8')).ab || 0 } catch {}

if (arg('--neu')) {
  const name = typeof arg('--neu') === 'string' ? arg('--neu') : 'Tester'
  const st = await post('/partie', { name })
  if (st.fehler) { console.error(st.fehler); process.exit(1) }
  ab = 0
  console.log(`Partie gestartet. Du bist ${name}.`)
}

let antwort = null
if (arg('--sagen')) antwort = await post('/aktion', { art: 'sagt', text: String(arg('--sagen')), an: typeof arg('--an') === 'string' ? arg('--an') : null })
else if (arg('--schweigen')) antwort = await post('/aktion', { art: 'schweigt' })
else if (arg('--platz')) antwort = await post('/aktion', { platz: arg('--platz'), ziel: typeof arg('--ziel') === 'string' ? arg('--ziel') : undefined })
else if (arg('--untersuchen')) antwort = await post('/aktion', { ort: arg('--untersuchen') === 'nichts' ? null : arg('--untersuchen') })
else if (arg('--stimme')) antwort = await post('/aktion', { fuer: arg('--stimme') === 'niemand' ? null : arg('--stimme') })
if (antwort && !antwort.ok) console.log(`ABGELEHNT: ${antwort.fehler}`)

if (arg('--hefte')) {
  // Die Figuren schreiben nach dem Ende noch (ein Aufruf je Figur) - darauf warten
  for (let i = 0; i < 40; i++) { const st = await fetch(basis + '/status').then(json); if (!st || st.hefteGeschrieben || st.phase !== 'ende') break; await schlaf(2000) }
  const h = await fetch(basis + '/hefte').then(json)
  if (!h.fehler && !Object.values(h).some((l) => l.length)) console.log('Noch keine Hefteinträge (die Figuren schreiben noch oder es lief ohne KI).')
  if (h.fehler) console.log(h.fehler)
  else for (const [n, liste] of Object.entries(h)) { const e = liste.at(-1); if (e) console.log(`\n${n}: ${e.eintrag}\n  Vertrauen: ${Object.entries(e.vertrauen || {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') || '-'}`) }
  process.exit(0)
}

// Warten, bis das Spiel wieder etwas von uns will oder vorbei ist (max. 90 s), dabei Neues zeigen
let gezeigt = ab, status = null
const start = Date.now()
for (;;) {
  const v = await fetch(basis + '/verlauf?ab=' + gezeigt).then(json)
  status = v.status
  for (const e of v.ereignisse) {
    const z = e.art === 'rolle' ? (e.name === status?.spieler ? `[Deine Rolle] ${e.rolle}` : '') : e.art === 'ende' ? `[ENDE] ${e.sieger === 'schueler' ? 'Die Schüler gewinnen' : 'Der Schatten gewinnt'}. Der Schatten war ${e.schatten}.` : verlaufAlsText([e], status?.spieler)
    if (z) console.log(z)
    gezeigt = e.nr + 1
  }
  if (!status || status.phase === 'ende' || status.warte || Date.now() - start > 90_000) break
  await schlaf(1500)
}
fs.writeFileSync(merker, JSON.stringify({ ab: gezeigt }))
if (!status) { console.log('Keine Partie. Starte mit --neu.'); process.exit(0) }
if (status.phase === 'ende') { console.log(`\n--- Partie vorbei (${status.nacht} Nächte). Hefte mit --hefte.`); process.exit(0) }
const w = status.warte
console.log(`\n--- Noch im Raum: ${status.lebende.join(', ')} · Phase: ${status.phase} · Nacht ${status.nacht}`)
if (!w) console.log('--- Die anderen sind dran. Nochmal aufrufen.')
else if (w.art === 'sagen') console.log(`--- DU BIST DRAN: --sagen "..." [--an ${w.andere.join('|')}]${w.pflicht ? ' (Pflicht)' : ' oder --schweigen'}`)
else if (w.art === 'nacht') console.log(`--- NACHT: --platz ${w.orte.join('|')}${w.aufgabe !== 'verstecken' ? ` --ziel ${w.optionen.join('|')}  (${w.aufgabe})` : ''}`)
else if (w.art === 'untersuchen') console.log(`--- UNTERSUCHEN: --untersuchen ${w.orte.join('|')}|nichts`)
else if (w.art === 'stimme') console.log(`--- ABSTIMMUNG: --stimme ${w.optionen.join('|')}|niemand`)
