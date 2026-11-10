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
import { kostenRechner, deckelAusUmgebung } from './spiel/kosten.mjs'
import { ORT_NAMEN, KLASSENBUCH } from './spiel/welt.mjs'
import { hefteSpeicher } from './spiel/hefte.mjs'
import { figurenSpeicher } from './spiel/figurenspeicher.mjs'
import { pruefeFigur, kennung, MAX_EIGENE, GRENZEN } from './spiel/figurenschema.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const OEFFENTLICH = path.join(HIER, 'public')
export const KI_FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam']
const ZUSCHAUER_ERSATZ = 'Ben'   // nimmt den Platz des Menschen ein, wenn nur zugeschaut wird
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

// Port aus der Umgebung: leer -> 4800, sonst ganze Zahl 0-65535, alles andere wirft eine deutsche Meldung.
export function pruefePort(wert) {
  if (wert === undefined || wert === null || String(wert).trim() === '') return 4800
  const n = Number(wert)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`Ungültiger Port „${wert}“ – NACHSITZEN_PORT muss eine Zahl von 0 bis 65535 sein`)
  return n
}

// Spielername: 1-20 Zeichen ohne Steuerzeichen und <>, kein Wort, das im Spiel schon etwas bedeutet.
// Leer ist erlaubt (Standardname „Du“); gibt den bereinigten Namen zurück oder wirft.
export function pruefeName(roh) {
  const name = String(roh ?? '').replace(/\s+/g, ' ').trim()
  if (!name) return 'Du'
  if (name.length > 20) throw new Error('Der Name darf höchstens 20 Zeichen lang sein')
  if (/[\p{Cc}\p{Cf}<>]/u.test(name)) throw new Error('Der Name enthält unerlaubte Zeichen (<, > oder Steuerzeichen)')
  const reserviert = ['niemand', 'alle', 'du', ZUSCHAUER_ERSATZ, KLASSENBUCH, ...ORT_NAMEN].map((w) => w.toLowerCase())
  if (reserviert.includes(name.toLowerCase())) throw new Error(`Der Name „${name}“ ist im Spiel schon belegt – wähle einen anderen`)
  return name
}

export const MAX_KI = 7, MIN_KI = 3   // plus Mensch oder Ben: 4 bis 8 Figuren wie in rollen.mjs
const MAX_FIGUREN_KOERPER = 8_000       // Bytes fuer Routen unter /figuren

// Herkunftspruefung fuer die Figuren-Routen (zusaetzlich zur Host-Pruefung): Ein Browser schickt bei
// fremden Seiten Origin bzw. Sec-Fetch-Site mit; Skripte (curl, Tests) schicken oft keins von beiden.
export function herkunftOk(headers) {
  const o = headers.origin
  if (o !== undefined && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return false
  const site = headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
}

// gehirnFabrik(name, rolle, { mitspieler, spieler, zufall, figur }) -> Gehirn; im Test Skript-Gehirne statt Claude
// figuren: Speicher fuer eigene Figuren (figurenSpeicher) oder null = Editor und eigene Figuren aus
export function erstelleServer({ gehirnFabrik, hefte = null, figuren: eigene = null, host = '127.0.0.1', port = pruefePort(process.env.NACHSITZEN_PORT), pause = 700, startwert = null, log = console.log } = {}) {
  const verbindungen = new Set()
  let spiel = null          // { p, spieler, zuschauen, mensch, gesendet }
  let partien = 0           // zaehlt die Partien; Teil der SSE-id, damit alte Nummern nicht zur neuen Partie passen

  // Eine SSE-Zeile; Spielereignisse tragen ihre Nummer als `id:`, damit der Browser sie bei der
  // automatischen Wiederverbindung als Last-Event-ID zurueckschickt.
  const sseZeile = (art, daten, id = null) => `${id === null ? '' : `id: ${id}\n`}event: ${art}\ndata: ${JSON.stringify(daten)}\n\n`
  const sende = (art, daten) => {
    const zeile = sseZeile(art, daten, art === 'ereignis' ? `${spiel.kennung}-${daten.nr}` : null)
    for (const res of verbindungen) { if (res.writableEnded) verbindungen.delete(res); else res.write(zeile) }
  }
  let ping = null   // Kommentarzeile alle 25 s, damit Proxys und Browser die Leitung nicht kappen
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

  // Besetzung (KI-Figuren) aufloesen: Namen -> Figurendaten. Ohne Angabe die sechs mitgelieferten.
  function besetzen(wunsch) {
    if (wunsch === undefined || wunsch === null) return KI_FIGUREN.map((n) => ladeFigur(n))
    if (!Array.isArray(wunsch) || wunsch.some((n) => typeof n !== 'string')) throw new Error('Die Besetzung muss eine Liste von Namen sein')
    if (wunsch.length < MIN_KI || wunsch.length > MAX_KI) throw new Error(`Wähle ${MIN_KI} bis ${MAX_KI} Figuren (dazu kommst du oder Ben: 4 bis 8 im Raum)`)
    const gesehen = new Set()
    return wunsch.map((n) => {
      if (gesehen.has(n.toLowerCase())) throw new Error(`„${n.slice(0, 20)}“ ist doppelt gewählt`)
      gesehen.add(n.toLowerCase())
      const eingebaut = KI_FIGUREN.find((k) => k.toLowerCase() === n.toLowerCase())
      if (eingebaut) return ladeFigur(eingebaut)
      const gefunden = eigene?.vonName(n)
      if (!gefunden) throw new Error(`Die Figur „${n.slice(0, 20)}“ gibt es nicht`)
      return gefunden
    })
  }

  function neuePartie({ name, zuschauen, besetzung }) {
    const spieler = zuschauen ? null : pruefeName(name)
    const ki = besetzen(besetzung)
    const namen = [...ki.map((f) => f.name), zuschauen ? ZUSCHAUER_ERSATZ : spieler]
    if (new Set(namen.map((n) => n.toLowerCase())).size !== namen.length) throw new Error('Der Name ist schon vergeben')
    const z = zufall(startwert ?? Date.now())
    const p = P.neuePartie(namen, z, { spieler })
    const datenVon = Object.fromEntries(ki.map((f) => [f.name, f]))
    const figuren = Object.fromEntries(namen.map((n) => [n, n === spieler ? { haut: '#f1cfb0', haar: '#2b2118', frisur: 'wuschel', shirt: '#bd93f9' } : (datenVon[n] ?? ladeFigur(n)).aussehen]))
    const gehirne = {}
    const meins = { p, spieler, zuschauen, mensch: null, figuren: figuren, gehirne, hefteGeschrieben: false, beendet: false }
    for (const n of namen) {
      if (n === spieler) { meins.mensch = browserGehirn(n, p.rollen[n], { sende }); gehirne[n] = meins.mensch }
      else {
        const g = gehirnFabrik(n, p.rollen[n], { mitspieler: namen, spieler, zufall: z, heft: hefte ? hefte.alsText(n) : '', figur: datenVon[n] ?? ladeFigur(n) })
        gehirne[n] = mitTippen(g, n, meins)
      }
    }
    if (spiel) { spiel.beendet = true; if (spiel.p.phase !== 'ende') spiel.mensch?.abbrechen() }   // alte Partie stoppt (Schleife, Tippen, Hefte)
    meins.kennung = ++partien
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
        if (sp !== spiel) return   // inzwischen neue Partie: Eintrag verwerfen, nichts senden
        hefte.schreiben(n, { ...e, rolle: sp.p.rollen[n], schatten: z.schatten, sieger: z.sieger, spieler: sp.spieler })
        eintraege[n] = e
      } catch (f) { log(`Heft ${n}: ${f.message}`) }
      if (sp !== spiel) return
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
      if (url.pathname === '/figuren' || url.pathname.startsWith('/figuren/')) {
        if (!eigene) { res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, fehler: 'Eigene Figuren sind abgeschaltet' })); return }
        if (!herkunftOk(req.headers)) { res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, fehler: 'Fremde Herkunft' })); return }
        const antwort = (status, daten) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(daten))
        const schreibend = req.method !== 'GET'
        if (schreibend && !/^application\/json(;|$)/i.test(req.headers['content-type'] || '')) { antwort(415, { ok: false, fehler: 'Nur application/json' }); return }
        const teile = url.pathname.split('/').slice(2)   // '' | ['pruefen'] | [kennung]
        if (teile.length > 1 || (teile.length === 1 && teile[0] === '')) { res.writeHead(404).end('nicht gefunden'); return }
        try {
          if (req.method === 'GET' && teile.length === 0) {
            const { figuren: liste, kaputt } = eigene.liste()
            antwort(200, { eigene: liste, kaputt, mitgeliefert: KI_FIGUREN.map((n) => ladeFigur(n)), max: MAX_EIGENE, grenzen: GRENZEN, besetzung: { min: MIN_KI, max: MAX_KI } })
          } else if (req.method === 'POST' && teile[0] === 'pruefen') {
            const body = await lies(req, MAX_FIGUREN_KOERPER)
            const r = pruefeFigur(body.figur)
            const k = r.ok ? kennung(r.figur.name) : ''
            antwort(200, { ok: r.ok, fehler: r.fehler, figur: r.figur, kennung: k, vorhanden: !!k && !!eigene.lesen(k) })
          } else if (req.method === 'POST' && teile.length === 0) {
            const body = await lies(req, MAX_FIGUREN_KOERPER)
            antwort(200, { ok: true, figur: eigene.anlegen(body.figur) })
          } else if (req.method === 'PUT' && teile.length === 1) {
            const body = await lies(req, MAX_FIGUREN_KOERPER)
            antwort(200, { ok: true, figur: eigene.ersetzen(teile[0], body.figur) })
          } else if (req.method === 'DELETE' && teile.length === 1) {
            antwort(200, { ok: true, papierkorb: eigene.loeschen(teile[0]) })
          } else res.writeHead(405).end()
        } catch (f) {
          antwort(f.status || 400, { ok: false, fehler: f.message, felder: f.fehler ?? [] })
        }
        return
      }
      if (req.method === 'GET' && url.pathname === '/ereignisse') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        verbindungen.add(res)
        req.on('close', () => verbindungen.delete(res))
        if (spiel) {
          // Last-Event-ID ("<partie>-<nr>"): nur Neueres nachliefern, aber nur aus derselben Partie.
          // Fremde Partie, Unsinn oder eine Nummer, die es noch nicht gibt, liefert alles.
          // Eine blanke Zahl (curl, Skripte) gilt fuer die laufende Partie.
          const m = /^(?:(\d+)-)?(\d+)$/.exec(req.headers['last-event-id'] ?? '')
          const gueltig = m && (m[1] === undefined || Number(m[1]) === spiel.kennung) && Number(m[2]) < spiel.p.ereignisse.length
          const letzte = gueltig ? Number(m[2]) : -1
          res.write(sseZeile('status', status()))   // zuerst, damit der Browser weiss, wer er ist
          for (const e of spiel.p.ereignisse) if (e.nr > letzte && sichtbar(e)) res.write(sseZeile('ereignis', fuerBrowser(e), `${spiel.kennung}-${e.nr}`))
          res.write(sseZeile('status', status()))
        } else res.write(sseZeile('status', null))
        return
      }
      if (req.method === 'POST' && url.pathname === '/partie') {
        const body = await lies(req)
        const neu = neuePartie(body)   // wirft bei ungueltigem Namen, bevor Kopfzeilen gesendet sind
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(neu))
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
      if (res.headersSent) { res.end(); return }
      res.writeHead(f.status || 400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, fehler: f.message }))
    }
  })

  return {
    server,
    melde: (art, daten) => sende(art, daten),
    starten: () => new Promise((f, w) => {
      server.once('error', (fehler) => {
        if (fehler.code === 'EADDRINUSE') w(new Error(`Port ${port} ist belegt – starte mit NACHSITZEN_PORT=${port + 1} npm start`))
        else if (fehler.code === 'EACCES') w(new Error(`Keine Berechtigung für Port ${port} – wähle einen Port über 1024, z. B. NACHSITZEN_PORT=4801 npm start`))
        else w(fehler)
      })
      server.listen(port, host, () => {
        clearInterval(ping)
        ping = setInterval(() => { for (const res of verbindungen) res.write(': ping\n\n') }, 25_000)
        ping.unref()
        f(server.address().port)
      })
    }),
    schliessen: () => new Promise((f) => { clearInterval(ping); for (const r of verbindungen) r.end(); if (spiel) spiel.beendet = true; spiel?.mensch?.abbrechen(); server.close(() => f()) }),
    partie: () => spiel?.p ?? null,
  }
}

// Koerper lesen, hoechstens `max` Bytes; zu gross -> Fehler mit Status 413 (der Rest wird verworfen)
function lies(req, max = 10_000) {
  return new Promise((f, w) => {
    const zuGross = () => Object.assign(new Error('zu gross'), { status: 413 })
    if (Number(req.headers['content-length'] || 0) > max) { req.resume(); w(zuGross()); return }
    const teile = []; let n = 0; let fertig = false
    req.on('data', (c) => { if (fertig) return; n += c.length; if (n > max) { fertig = true; w(zuGross()); req.resume(); return } teile.push(c) })
    req.on('end', () => {
      if (fertig) return
      const t = Buffer.concat(teile).toString('utf8')
      try { f(t ? JSON.parse(t) : {}) } catch { w(new Error('kein JSON')) }
    })
  })
}

// --- Start von der Kommandozeile: echte Claude-Gehirne ----------------------------------
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  try {
  if (process.argv.includes('--skript')) {
    // Ohne KI und ohne Kosten: Skript-Gehirne, zum Entwickeln der Oberflaeche
    const { skriptGehirn } = await import('./tools/skriptgehirne.mjs')
    const s = erstelleServer({ gehirnFabrik: (name, rolle, { zufall: z }) => skriptGehirn(name, rolle, z), pause: 900, figuren: figurenSpeicher() })
    console.log(`Nachsitzen (Skript-Modus, keine KI) laeuft auf http://localhost:${await s.starten()}`)
  } else {
  const deckel = deckelAusUmgebung()
  const kosten = kostenRechner({ deckel })
  console.log(`  Tagesdeckel: ${deckel} $ (NACHSITZEN_DECKEL)`)
  const anfrage = claudeAnfrage({ schluessel: apiSchluessel(), kosten, log: (m) => console.log(`  (${m})`) })
  let deckelGemeldet = false
  const fabrik = (name, rolle, opts) => claudeGehirn(opts.figur ?? ladeFigur(name), rolle, { anfrage, ...opts, log: (m) => {
    console.log(`  (${m})`)
    if (m.includes('Tagesdeckel') && !deckelGemeldet) { deckelGemeldet = true; s.melde('deckel', { text: 'Der Tagesdeckel für die KI-Aufrufe ist erreicht. Die Figuren schweigen ab jetzt, bis morgen (oder du erhöhst NACHSITZEN_DECKEL).' }) }
  } })
  const s = erstelleServer({ gehirnFabrik: fabrik, hefte: hefteSpeicher(), figuren: figurenSpeicher() })
  const port = await s.starten()
  console.log(`Nachsitzen laeuft auf http://localhost:${port}`)
  const t = kosten.heute()
  if (t.aufrufe) console.log(`Heute bisher: ${t.aufrufe} Aufrufe, ${(t.dollar * 100).toFixed(1)} Cent`)
  }
  } catch (f) {
    console.error(f.message)
    process.exit(1)
  }
}
