// Nachsitzen im Browser: kleiner Server auf 127.0.0.1, der eine Partie faehrt und den Browser
// per Server-Sent Events fuettert. Der API-Schluessel bleibt hier, der Browser sieht ihn nie.
//   node server.mjs            http://localhost:4800
//   NACHSITZEN_PORT=4801 node server.mjs

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zufall } from './spiel/zufall.mjs'
import * as P from './spiel/partie.mjs'
import { spieleBisZumEnde } from './spiel/schleife.mjs'
import { claudeGehirn, ladeFigur } from './spiel/gehirn.mjs'
import { browserGehirn } from './spiel/browsergehirn.mjs'
import { claudeAnfrage } from './spiel/claude.mjs'
import { apiSchluessel } from './spiel/schluessel.mjs'
import { kostenRechner } from './spiel/kosten.mjs'
import { ORT_NAMEN, KLASSENBUCH } from './spiel/welt.mjs'
import { hefteSpeicher } from './spiel/hefte.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const OEFFENTLICH = path.join(HIER, 'public')
export const KI_FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam']
const ZUSCHAUER_ERSATZ = 'Ben'   // nimmt den Platz des Menschen ein, wenn nur zugeschaut wird
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

// gehirnFabrik(name, rolle, { mitspieler, spieler, zufall }) -> Gehirn; im Test Skript-Gehirne statt Claude
export function erstelleServer({ gehirnFabrik, hefte = null, host = '127.0.0.1', port = Number(process.env.NACHSITZEN_PORT || 4800), pause = 700, startwert = null, log = console.log } = {}) {
  const verbindungen = new Set()
  let spiel = null          // { p, spieler, zuschauen, mensch, gesendet }

  const sende = (art, daten) => {
    const zeile = `event: ${art}\ndata: ${JSON.stringify(daten)}\n\n`
    for (const res of verbindungen) { if (res.writableEnded) verbindungen.delete(res); else res.write(zeile) }
  }
  const status = () => spiel && {
    phase: spiel.p.phase, nacht: spiel.p.nacht, runde: spiel.p.runde, lebende: spiel.p.lebende, keller: spiel.p.keller,
    verschwunden: spiel.p.verschwunden, spieler: spiel.spieler, zuschauen: spiel.zuschauen, sieger: spiel.p.sieger,
    rolle: spiel.spieler ? spiel.p.rollen[spiel.spieler] : null,
    rollen: spiel.zuschauen || spiel.p.phase === 'ende' ? spiel.p.rollen : null,
    figuren: spiel.figuren, warte: spiel.mensch?.wartetAuf() ?? null, orte: ORT_NAMEN, klassenbuch: KLASSENBUCH, hefte: !!hefte, hefteGeschrieben: spiel.hefteGeschrieben,
    geist: !!spiel.spieler && !spiel.p.lebende.includes(spiel.spieler), untersuchungenUebrig: spiel.spieler ? P.untersuchungenUebrig(spiel.p, spiel.spieler) : null,
  }
  // Zuschauer sehen alles. Der Spieler sieht, was seine Figur sehen darf; ist er verschwunden
  // oder im Keller, schaut er als Geist weiter zu (alles ausser privaten Nacht-Ereignissen).
  // Als Geist (verschwunden oder im Keller) sieht der Spieler alles, auch die Nacht der anderen.
  const sichtbar = (e) => spiel.zuschauen || e.sichtbar.includes(spiel.spieler) || !spiel.p.lebende.includes(spiel.spieler)
  const fuerBrowser = (e) => { const { sichtbar: _, ...rest } = e; return rest }

  function neuePartie({ name, zuschauen }) {
    if (spiel) { spiel.beendet = true; if (spiel.p.phase !== 'ende') spiel.mensch?.abbrechen() }   // alte Partie stoppt (Schleife, Tippen, Hefte)
    const spieler = zuschauen ? null : (String(name || '').trim().slice(0, 20) || 'Du')
    const namen = [...KI_FIGUREN, zuschauen ? ZUSCHAUER_ERSATZ : spieler]
    if (new Set(namen.map((n) => n.toLowerCase())).size !== namen.length) throw new Error('Der Name ist schon vergeben')
    const z = zufall(startwert ?? Date.now())
    const p = P.neuePartie(namen, z, { spieler })
    const figuren = Object.fromEntries(namen.map((n) => [n, n === spieler ? { haut: '#f1cfb0', haar: '#2b2118', frisur: 'wuschel', shirt: '#bd93f9' } : ladeFigur(n).aussehen]))
    const gehirne = {}
    const meins = { p, spieler, zuschauen, mensch: null, figuren, gehirne, hefteGeschrieben: false, beendet: false }
    for (const n of namen) {
      if (n === spieler) { meins.mensch = browserGehirn(n, p.rollen[n], { sende }); gehirne[n] = meins.mensch }
      else {
        const g = gehirnFabrik(n, p.rollen[n], { mitspieler: namen, spieler, zufall: z, heft: hefte ? hefte.alsText(n) : '' })
        gehirne[n] = mitTippen(g, n, meins)
      }
    }
    spiel = meins
    const beobachter = (e) => { if (meins.beendet) return; if (sichtbar(e)) sende('ereignis', fuerBrowser(e)); sende('status', status()) }
    spieleBisZumEnde(p, gehirne, { zufall: z, beobachter, abbruch: () => meins.beendet, pause: () => new Promise((f) => setTimeout(f, pause)) })
      .then(() => hefteSchreiben(meins))
      .catch((f) => {
        log(`Partie beendet: ${f.message}`)
        if (meins.beendet) return   // abgeloest durch eine neue Partie: nichts mehr senden
        if (p.phase !== 'ende') { p.phase = 'ende'; p.sieger = p.sieger || null } sende('status', status())
      })
    return status()
  }

  // Nach dem Ende schreibt jede KI-Figur in ihr Heft (ein Aufruf pro Figur); der Browser bekommt die Eintraege.
  async function hefteSchreiben(sp) {
    if (!hefte || sp !== spiel) return
    const z = P.zusammenfassung(sp.p)
    const eintraege = {}
    for (const [n, g] of Object.entries(sp.gehirne)) {
      if (!g.heftSchreiben) continue
      if (sp !== spiel) return   // neue Partie gestartet: keine weiteren Heft-Aufrufe
      sende('tippt', { von: n })
      try {
        const e = await g.heftSchreiben(P.verlaufFuer(sp.p, n), z)
        hefte.schreiben(n, { ...e, rolle: sp.p.rollen[n], schatten: z.schatten, sieger: z.sieger, spieler: sp.spieler })
        eintraege[n] = e
      } catch (f) { log(`Heft ${n}: ${f.message}`) }
      sende('tippt', { von: n, fertig: true })
    }
    sp.hefteGeschrieben = true
    sende('hefte', eintraege); sende('status', status())
  }

  // KI-Gehirne melden vorher "tippt", damit der Browser Leben zeigt
  function mitTippen(g, n, sp) {
    const melde = (daten) => { if (!sp.beendet) sende('tippt', daten) }
    const h = (fn) => async (...a) => { melde({ von: n }); try { return await fn(...a) } finally { melde({ von: n, fertig: true }) } }
    return { ...g, abend: h(g.abend), nacht: g.nacht, diskussion: h(g.diskussion), abstimmung: h(g.abstimmung) }
  }

  const server = http.createServer(async (req, res) => {
    const hostKopf = req.headers.host || ''
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostKopf)) { res.writeHead(403).end('nur lokal'); return }
    const url = new URL(req.url, `http://${hostKopf}`)
    try {
      if (req.method === 'GET' && url.pathname === '/ereignisse') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        verbindungen.add(res)
        req.on('close', () => verbindungen.delete(res))
        if (spiel) {
          res.write(`event: status\ndata: ${JSON.stringify(status())}\n\n`)   // zuerst, damit der Browser weiss, wer er ist
          for (const e of spiel.p.ereignisse) if (sichtbar(e)) res.write(`event: ereignis\ndata: ${JSON.stringify(fuerBrowser(e))}\n\n`)
          res.write(`event: status\ndata: ${JSON.stringify(status())}\n\n`)
        } else res.write('event: status\ndata: null\n\n')
        return
      }
      if (req.method === 'POST' && url.pathname === '/partie') {
        const body = await lies(req)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(neuePartie(body)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/aktion') {
        const body = await lies(req)
        const fehler = spiel?.mensch ? spiel.mensch.aktion(body) : 'Keine laufende Partie'
        res.writeHead(fehler ? 400 : 200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: !fehler, fehler }))
        return
      }
      if (req.method === 'GET' && url.pathname === '/hefte') {
        // Nur zwischen den Partien lesbar - waehrend des Spiels wuesste der Spieler sonst, wer ihm misstraut
        if (!hefte || (spiel && spiel.p.phase !== 'ende')) { res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ fehler: 'Hefte gibt es erst nach der Partie' })); return }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(hefte.alle([...KI_FIGUREN, ZUSCHAUER_ERSATZ])))
        return
      }
      if (req.method === 'GET' && url.pathname === '/verlauf') {
        // Alle sichtbaren Ereignisse ab ?ab=<nr> als JSON (fuer Skripte und Tests ohne SSE)
        const ab = Number(url.searchParams.get('ab') || 0)
        const liste = spiel ? spiel.p.ereignisse.filter((e) => e.nr >= ab && sichtbar(e)).map(fuerBrowser) : []
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ereignisse: liste, status: status() }))
        return
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(status()))
        return
      }
      if (req.method === 'GET') {
        const datei = path.normalize(path.join(OEFFENTLICH, url.pathname === '/' ? 'index.html' : url.pathname))
        if (!datei.startsWith(OEFFENTLICH) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404).end('nicht gefunden'); return }
        res.writeHead(200, { 'content-type': MIME[path.extname(datei)] || 'application/octet-stream' }).end(fs.readFileSync(datei))
        return
      }
      res.writeHead(405).end()
    } catch (f) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, fehler: f.message }))
    }
  })

  return {
    server,
    melde: (art, daten) => sende(art, daten),
    starten: () => new Promise((f) => server.listen(port, host, () => f(server.address().port))),
    schliessen: () => new Promise((f) => { for (const r of verbindungen) r.end(); spiel?.mensch?.abbrechen(); server.close(() => f()) }),
    partie: () => spiel?.p ?? null,
  }
}

function lies(req) {
  return new Promise((f, w) => {
    let t = ''
    req.on('data', (c) => { t += c; if (t.length > 10_000) w(new Error('zu gross')) })
    req.on('end', () => { try { f(t ? JSON.parse(t) : {}) } catch { w(new Error('kein JSON')) } })
  })
}

// --- Start von der Kommandozeile: echte Claude-Gehirne ----------------------------------
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--skript')) {
    // Ohne KI und ohne Kosten: Skript-Gehirne, zum Entwickeln der Oberflaeche
    const { skriptGehirn } = await import('./tools/skriptgehirne.mjs')
    const s = erstelleServer({ gehirnFabrik: (name, rolle, { zufall: z }) => skriptGehirn(name, rolle, z), pause: 900 })
    console.log(`Nachsitzen (Skript-Modus, keine KI) laeuft auf http://localhost:${await s.starten()}`)
  } else {
  const kosten = kostenRechner()
  const anfrage = claudeAnfrage({ schluessel: apiSchluessel(), kosten, log: (m) => console.log(`  (${m})`) })
  let deckelGemeldet = false
  const fabrik = (name, rolle, opts) => claudeGehirn(ladeFigur(name), rolle, { anfrage, ...opts, log: (m) => {
    console.log(`  (${m})`)
    if (m.includes('Tagesdeckel') && !deckelGemeldet) { deckelGemeldet = true; s.melde('deckel', { text: 'Der Tagesdeckel für die KI-Aufrufe ist erreicht. Die Figuren schweigen ab jetzt, bis morgen (oder du erhöhst DECKEL_PRO_TAG in spiel/kosten.mjs).' }) }
  } })
  const s = erstelleServer({ gehirnFabrik: fabrik, hefte: hefteSpeicher() })
  const port = await s.starten()
  console.log(`Nachsitzen laeuft auf http://localhost:${port}`)
  const t = kosten.heute()
  if (t.aufrufe) console.log(`Heute bisher: ${t.aufrufe} Aufrufe, ${(t.dollar * 100).toFixed(1)} Cent`)
  }
}
