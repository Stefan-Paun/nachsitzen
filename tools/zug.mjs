// Nachsitzen von der Kommandozeile aus mitspielen (fuer Tests und Agenten, ohne Browser).
//   node tools/zug.mjs <port> --neu [Name]            neue Partie als Mensch starten
//   node tools/zug.mjs <port>                         neue Ereignisse zeigen + worauf das Spiel wartet
//   node tools/zug.mjs <port> --sagen "Text" [--an Name]
//   node tools/zug.mjs <port> --schweigen
//   node tools/zug.mjs <port> --platz Tür [--ziel Mira] [--verwischen]   (Nacht; Ziel nur fuer Schatten/Schluesseltraeger)
//   node tools/zug.mjs <port> --untersuchen Tafel|Klassenbuch|nichts
//   node tools/zug.mjs <port> --zeigen ja|nein             (eigenes Untersuchungsergebnis allen vorzeigen)
//   node tools/zug.mjs <port> --stimme Nora|niemand        (geheim; wird erst am Ende aufgedeckt)
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
  console.log(`Partie gestartet. Du bist ${name}.
Kurz die Regeln: Sechs sitzen fest, einer ist der Schatten, einer hat den Schlüssel (prüft nachts eine Person).
Nachts stellt sich jeder an einen von vier Plätzen (Tür · Tafel · Pulte · Fenster, von links nach rechts).
Jeder Platz hat einen Vorteil: Tür hört jeden Schritt, Tafel merkt jeden, der vorbeihuscht, Pulte sieht links und rechts, Fenster zeigt im Mondlicht alle dort.
Der Schatten schleicht zu seinem Opfer; Tintenspur = Richtung, aus der er kam, Kreidestaub = wo er durchging.
Tagsüber: einmal untersuchen (höchstens dreimal pro Partie), Ergebnis vorzeigen (gilt als bewiesen), reden, geheim abstimmen.
Die Schüler gewinnen, wenn der Schatten im Keller ist; der Schatten, wenn nur noch zwei übrig sind.`)
}

let antwort = null
if (arg('--sagen')) antwort = await post('/aktion', { art: 'sagt', text: String(arg('--sagen')), an: typeof arg('--an') === 'string' ? arg('--an') : null })
else if (arg('--schweigen')) antwort = await post('/aktion', { art: 'schweigt' })
else if (arg('--platz')) antwort = await post('/aktion', { platz: arg('--platz'), ziel: typeof arg('--ziel') === 'string' ? arg('--ziel') : undefined, verwischen: !!arg('--verwischen') })
else if (arg('--untersuchen')) antwort = await post('/aktion', { ort: arg('--untersuchen') === 'nichts' ? null : arg('--untersuchen') })
else if (arg('--zeigen')) antwort = await post('/aktion', { zeigen: arg('--zeigen') !== 'nein' })
else if (arg('--stimme')) antwort = await post('/aktion', { fuer: arg('--stimme') === 'niemand' ? null : arg('--stimme') })
if (antwort && !antwort.ok) console.log(`ABGELEHNT: ${antwort.fehler}`)

if (arg('--hefte')) {
  // Die Figuren schreiben nach dem Ende noch (ein Aufruf je Figur) - darauf warten
  for (let i = 0; i < 40; i++) { const st = await fetch(basis + '/status').then(json); if (!st || st.hefteGeschrieben || st.phase !== 'ende') break; await schlaf(2000) }
  const h = await fetch(basis + '/hefte').then(json)
  if (!h.fehler && !Object.values(h).some((l) => l.length)) console.log('Noch keine Hefteinträge (die Figuren schreiben noch oder es lief ohne KI).')
  if (h.fehler) console.log(h.fehler)
  else { console.log('Die Hefte (Vertrauen: -2 traut gar nicht … +2 vertraut):'); for (const [n, liste] of Object.entries(h)) { const e = liste.at(-1); if (e) console.log(`\n${n}: ${e.eintrag}\n  Vertrauen: ${Object.entries(e.vertrauen || {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') || '-'}`) } }
  process.exit(0)
}

// Warten, bis das Spiel wieder etwas von uns will oder vorbei ist (max. 90 s), dabei Neues zeigen
let gezeigt = ab, status = null, rausGemeldet = false
const start = Date.now()
for (;;) {
  const v = await fetch(basis + '/verlauf?ab=' + gezeigt).then(json)
  status = v.status
  for (const e of v.ereignisse) {
    const ROLLE = { schatten: 'der Schatten (du holst nachts jemanden; lüge über deinen Platz; gewinne, wenn nur noch zwei übrig sind)', schluessel: 'der Schlüsselträger (du prüfst nachts eine Person und erfährst, ob sie der Schatten ist; teile es klug)', schueler: 'ein normaler Schüler (finde den Schatten über Spuren, Beobachtungen und Widersprüche)' }
    const z = e.art === 'rolle' ? (e.name === status?.spieler ? `[Deine Rolle] ${ROLLE[e.rolle] || e.rolle}` : '')
      : e.art === 'ende' ? `[ENDE] ${e.sieger === 'schueler' ? 'Die Schüler gewinnen' : 'Der Schatten gewinnt'}. Der Schatten war ${e.schatten}.`
      : e.art === 'wahrheit' ? `[DIE WAHRHEIT] Rollen: ${Object.entries(e.rollen).map(([n, r]) => `${n}=${r}`).join(', ')}\n` + e.naechte.map((n) => `  Nacht ${n.nacht}: ${Object.entries(n.plaetze).map(([k, o]) => `${k}@${o}`).join(' ')} · Schatten ${n.schatten} holt ${n.opfer}${n.verwischt ? ' (Spur verwischt)' : ''}`).join('\n')
      : verlaufAlsText([e], status?.spieler)
    if (z) console.log(z)
    if (!rausGemeldet && status?.spieler && ((e.art === 'verschwunden' && e.name === status.spieler) || (e.art === 'eingesperrt' && e.name === status.spieler))) {
      console.log(`\n>>> DU BIST RAUS (${e.art === 'verschwunden' ? 'der Schatten hat dich geholt' : 'die anderen haben dich in den Keller gesperrt'}). Du schaust als Geist weiter zu: einfach weiter aufrufen, bis die Partie vorbei ist.`)
      rausGemeldet = true
    }
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
else if (w.art === 'nacht') console.log(`--- NACHT: --platz ${w.orte.join('|')}${w.aufgabe !== 'verstecken' ? ` --ziel ${w.optionen.join('|')}  (${w.aufgabe === 'holen' ? 'Pflicht: wen du holst' : 'Pflicht: wen du prüfst'})` : ''}${w.verwischen ? ' [--verwischen: einmalig die Spur verwischen]' : ''}`)
else if (w.art === 'untersuchen') console.log(`--- UNTERSUCHEN (noch ${w.uebrig ?? '?'}× in dieser Partie): --untersuchen ${w.orte.join('|')}|nichts`)
else if (w.art === 'zeigen') console.log(`--- VORZEIGEN? Dein Ergebnis: „${w.ergebnis}“ · --zeigen ja|nein (vorgezeigt = für alle bewiesen)`)
else if (w.art === 'stimme') console.log(`--- ABSTIMMUNG (geheim): --stimme ${w.optionen.join('|')}|niemand`)
