import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { erstelleServer } from '../server.mjs'
import { hefteSpeicher } from '../spiel/hefte.mjs'
import { skriptGehirn } from '../tools/skriptgehirne.mjs'
import { browserGehirn } from '../spiel/browsergehirn.mjs'
import { zufall } from '../spiel/zufall.mjs'
import { SCHATTEN, SCHLUESSEL } from '../spiel/rollen.mjs'

const fabrik = (name, rolle, { zufall: z }) => skriptGehirn(name, rolle, z)

// Liest SSE-Ereignisse, bis `bis(ereignisse)` wahr ist oder die Zeit um ist.
async function sse(port, bis, { auf = async () => {}, zeit = 8000 } = {}) {
  const ac = new AbortController()
  const wecker = setTimeout(() => ac.abort(), zeit)
  const r = await fetch(`http://127.0.0.1:${port}/ereignisse`, { signal: ac.signal })
  const leser = r.body.getReader(); const dec = new TextDecoder()
  const ereignisse = []; let rest = ''
  const ende = Date.now() + zeit
  try {
    while (Date.now() < ende) {
      const { value, done } = await leser.read(); if (done) break
      rest += dec.decode(value, { stream: true })
      let i
      while ((i = rest.indexOf('\n\n')) >= 0) {
        const block = rest.slice(0, i); rest = rest.slice(i + 2)
        const art = /^event: (.+)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1]
        const e = { art, daten: JSON.parse(data) }
        ereignisse.push(e); await auf(e)
      }
      if (bis(ereignisse)) break
    }
  } catch (f) { if (f.name !== 'AbortError') throw f } finally { clearTimeout(wecker); ac.abort() }
  return ereignisse
}
const post = (port, pfad, body) => fetch(`http://127.0.0.1:${port}${pfad}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))

test('Server: statische Seite, nur lokaler Host, kein Pfad-Ausbruch', async () => {
  const s = erstelleServer({ gehirnFabrik: fabrik, port: 0, pause: 0 })
  const port = await s.starten()
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`); assert.equal(r.status, 200); assert.match(await r.text(), /Nachsitzen/)
    assert.equal((await fetch(`http://127.0.0.1:${port}/app.js`)).status, 200)
    assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404)
    const fremd = await new Promise((f) => http.get({ host: '127.0.0.1', port, path: '/', headers: { host: 'boese.example' } }, (r) => f(r.statusCode)))
    assert.equal(fremd, 403)   // fetch() erlaubt keinen eigenen Host-Header, darum roh
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/status`)).text(), 'null')
  } finally { await s.schliessen() }
})

test('Server: Zuschauer-Partie laeuft mit Skript-Gehirnen bis zum Ende, Rollen sichtbar', async () => {
  const s = erstelleServer({ gehirnFabrik: fabrik, port: 0, pause: 0, startwert: 5 })
  const port = await s.starten()
  try {
    const { status, body } = await post(port, '/partie', { zuschauen: true })
    assert.equal(status, 200); assert.equal(body.zuschauen, true); assert.ok(body.rollen)
    const ev = await sse(port, (l) => l.some((e) => e.art === 'status' && e.daten?.phase === 'ende'))
    const arten = ev.filter((e) => e.art === 'ereignis').map((e) => e.daten.art)
    assert.ok(arten.includes('schatten-waehlt') && arten.includes('pruefung') && arten.includes('platz') && arten.includes('fund'), 'Zuschauer sehen auch die Nacht und die Funde')
    assert.ok(ev.some((e) => e.art === 'tippt'))
    assert.ok(!ev.some((e) => e.art === 'ereignis' && 'sichtbar' in e.daten), 'Sichtbarkeitsliste geht nicht an den Browser')
    assert.ok(['schueler', 'schatten'].includes(s.partie().sieger))
  } finally { await s.schliessen() }
})

test('Server: Spieler-Partie, Eingaben per POST, private Ereignisse bleiben privat', async () => {
  const s = erstelleServer({ gehirnFabrik: fabrik, port: 0, pause: 0, startwert: 7 })
  const port = await s.starten()
  try {
    const { body } = await post(port, '/partie', { name: 'Stefan' })
    assert.equal(body.spieler, 'Stefan'); assert.equal(body.rollen, null)
    const rolle = body.rolle
    const ev = await sse(port, (l) => l.some((e) => e.art === 'status' && e.daten?.phase === 'ende'), {
      auf: async (e) => {
        // Die erste Eingabe kann schon vor dem Verbinden gefragt worden sein: dann steht sie im Status
        const w = e.art === 'warte' ? e.daten : e.art === 'status' ? e.daten?.warte : null
        if (!w) return
        if (w.art === 'sagen') await post(port, '/aktion', { art: 'sagt', text: 'Ich war am Fenster.', an: w.andere[0] })
        else if (w.art === 'stimme') await post(port, '/aktion', { fuer: w.optionen[0] })
        else if (w.art === 'nacht') await post(port, '/aktion', { platz: w.orte[0], ziel: w.optionen[0] })
        else if (w.art === 'untersuchen') await post(port, '/aktion', { ort: w.orte[0] })
        else if (w.art === 'zeigen') await post(port, '/aktion', { zeigen: true })
      }, zeit: 15000,
    })
    const p = s.partie()
    assert.equal(p.phase, 'ende')
    const alles = ev.filter((e) => e.art === 'ereignis').map((e) => e.daten)
    // Sobald Stefan raus ist, sieht er als Geist alles; privat bleibt nur, was davor kam
    const raus = alles.findIndex((e) => (e.art === 'verschwunden' || e.art === 'keller') && e.name === 'Stefan')
    const gesehen = raus < 0 ? alles : alles.slice(0, raus)
    if (raus >= 0) assert.ok(alles.slice(raus).some((e) => e.art === 'platz' && e.wer !== 'Stefan') || p.nacht === alles[raus].nacht, 'als Geist sieht er die Plaetze der anderen')
    assert.ok(alles.filter((e) => e.art === 'rolle').every((e) => e.name === 'Stefan'), 'nur die eigene Rolle')
    if (rolle !== SCHATTEN) assert.ok(!gesehen.some((e) => e.art === 'schatten-waehlt'))
    if (rolle !== SCHLUESSEL) assert.ok(!gesehen.some((e) => e.art === 'pruefung'))
    assert.ok(gesehen.filter((e) => e.art === 'platz').every((e) => e.wer === 'Stefan'), 'nur der eigene Platz')
    assert.ok(gesehen.filter((e) => e.art === 'ergebnis').every((e) => e.wer === 'Stefan'), 'nur eigene Untersuchungsergebnisse')
    assert.ok(gesehen.some((e) => e.art === 'sagt' && e.von === 'Stefan' && e.text === 'Ich war am Fenster.'))
    const falsch = await post(port, '/aktion', { art: 'sagt', text: 'zu spaet' })
    assert.equal(falsch.status, 400)
  } finally { await s.schliessen() }
})

test('Browser-Gehirn weist ungueltige Eingaben ab und loest gueltige ein', async () => {
  const gesendet = []
  const g = browserGehirn('Stefan', SCHATTEN, { sende: (a, d) => gesendet.push([a, d]) })
  assert.equal(g.aktion({ art: 'sagt', text: 'x' }), 'Gerade ist keine Eingabe gefragt')
  const v = g.abend([], ['Stefan', 'Mira', 'Lea'])
  assert.deepEqual(g.wartetAuf(), { art: 'sagen', pflicht: true, andere: ['Mira', 'Lea'] })
  assert.equal(g.aktion({ art: 'schweigt' }), 'Sag zumindest einen Satz')
  assert.match(g.aktion({ art: 'sagt', text: '  Hallo  ', an: 'Niemand' }), /Niemand ist nicht im Raum/)
  assert.equal(g.aktion({ art: 'sagt', text: '  Hallo  ', an: null }), null)
  assert.deepEqual(await v, { art: 'sagt', text: 'Hallo', an: null, behauptet: null })
  const n = g.nacht([], ['Stefan', 'Mira', 'Lea'], { orte: ['Tür', 'Fenster'], ziele: ['Lea'] })
  assert.deepEqual(g.wartetAuf(), { art: 'nacht', aufgabe: 'holen', orte: ['Tür', 'Fenster'], optionen: ['Lea'], verwischen: false })
  assert.match(g.aktion({ ziel: 'Lea' }), /Du brauchst einen Platz\. Plätze: Tür, Fenster/)
  assert.match(g.aktion({ platz: 'Mond', ziel: 'Lea' }), /„Mond“ ist kein Platz/)
  assert.match(g.aktion({ platz: 'Tür', ziel: 'Mira' }), /Mira kannst du heute nicht holen\. Möglich: Lea/)
  assert.match(g.aktion({ platz: 'Tür' }), /wen du holst/)
  assert.equal(g.aktion({ platz: 'Tür', ziel: 'Lea' }), null)
  assert.deepEqual(await n, { platz: 'Tür', ziel: 'Lea', verwischen: false })
  const u = g.untersuchen([], [], { orte: ['Tür', 'Klassenbuch'] })
  assert.match(g.aktion({ ort: 'Keller' }), /„Keller“ kannst du nicht untersuchen\. Möglich: Tür, Klassenbuch oder nichts/)
  assert.equal(g.aktion({ ort: null }), null)
  assert.equal(await u, null)
  const z = g.zeigen([], [], { ergebnis: { text: 'Hier stand Mira.' } })
  assert.deepEqual(g.wartetAuf(), { art: 'zeigen', ergebnis: 'Hier stand Mira.' })
  assert.equal(g.aktion({ zeigen: true }), null); assert.equal(await z, true)
  const d2 = g.diskussion([], ['Stefan', 'Mira'])
  assert.match(g.aktion({ art: 'sagt', text: 'Hi', an: 'Hans' }), /Hans ist nicht im Raum/)
  assert.equal(g.aktion({ art: 'sagt', text: 'Hi', an: 'Mira' }), null); assert.equal((await d2).an, 'Mira')
  const st = g.abstimmung([], ['Stefan', 'Mira'])
  assert.match(g.aktion({ fuer: 'Stefan' }), /steht nicht zur Wahl/)
  assert.equal(g.aktion({ fuer: null }), null)
  assert.deepEqual(await st, { fuer: null })
  const d = g.diskussion([], ['Stefan', 'Mira'])
  g.abbrechen()
  await assert.rejects(d, /abgebrochen/)
  assert.ok(gesendet.some(([a, d]) => a === 'warte' && d === null))
})

test('Server: nach dem Ende schreiben Figuren mit heftSchreiben ins Heft, /hefte nur zwischen Partien', async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-srv-hefte-'))
  const hefte = hefteSpeicher({ ordner })
  const gelesen = {}
  const fabrikMitHeft = (name, rolle, opts) => {
    gelesen[name] = opts.heft
    const g = skriptGehirn(name, rolle, opts.zufall)
    g.heftSchreiben = async (sicht, z) => ({ eintrag: `${name}: der Schatten war ${z.schatten}.`, vertrauen: { Sam: -1 } })
    return g
  }
  hefte.schreiben('Mira', { eintrag: 'Alter Eintrag.', vertrauen: { Lea: 2 } })
  const s = erstelleServer({ gehirnFabrik: fabrikMitHeft, hefte, port: 0, pause: 0, startwert: 5 })
  const port = await s.starten()
  try {
    await post(port, '/partie', { zuschauen: true })
    assert.match(gelesen.Mira, /Alter Eintrag/); assert.equal(gelesen.Lea, '')
    assert.equal((await fetch(`http://127.0.0.1:${port}/hefte`)).status, 403, 'waehrend der Partie gesperrt')
    const ev = await sse(port, (l) => l.some((e) => e.art === 'hefte'))
    const h = ev.find((e) => e.art === 'hefte').daten
    assert.ok(Object.keys(h).length >= 5); assert.match(h.Nora.eintrag, /der Schatten war/)
    assert.equal(hefte.lesen('Mira').length, 2); assert.equal(hefte.lesen('Mira').at(-1).sieger, s.partie().sieger)
    const r = await fetch(`http://127.0.0.1:${port}/hefte`); assert.equal(r.status, 200)
    const alle = await r.json(); assert.equal(alle.Mira.length, 2)
    assert.ok(ev.some((e) => e.art === 'status' && e.daten?.hefteGeschrieben === true))
  } finally { await s.schliessen() }
})

test('Server: neue Partie beendet die laufende Zuschauer-Partie (keine Gehirn-Aufrufe, keine alten Ereignisse)', async () => {
  let aktuell = 1
  const aufrufe = { 1: 0, 2: 0 }
  const zaehlend = (name, rolle, { zufall: z }) => {
    const nr = aktuell
    const g = skriptGehirn(name, rolle, z)
    const w = (fn) => (...a) => { aufrufe[nr]++; return fn.apply(g, a) }
    return { ...g, abend: w(g.abend), nacht: w(g.nacht), diskussion: w(g.diskussion), abstimmung: w(g.abstimmung) }
  }
  const s = erstelleServer({ gehirnFabrik: zaehlend, port: 0, pause: 30, startwert: 5 })
  const port = await s.starten()
  try {
    await post(port, '/partie', { zuschauen: true })
    const alt = s.partie()
    await new Promise((f) => setTimeout(f, 250))
    assert.ok(aufrufe[1] > 0 && alt.phase !== 'ende', 'alte Partie laeuft noch')
    aktuell = 2
    await post(port, '/partie', { name: 'Test' })
    const [ereignisse, anzahl] = [alt.ereignisse.length, aufrufe[1]]
    const ev = await sse(port, () => false, { zeit: 500 })
    assert.equal(alt.ereignisse.length, ereignisse, 'alte Partie erzeugt keine Ereignisse mehr')
    assert.equal(aufrufe[1], anzahl, 'alte Gehirne werden nicht mehr gefragt')
    const neu = s.partie()
    assert.notEqual(neu, alt)
    // Im Strom stehen nur Ereignisse der neuen Partie (Mensch Test, keine Zuschauer-Rollenliste)
    assert.ok(ev.filter((e) => e.art === 'status' && e.daten).every((e) => e.daten.spieler === 'Test' && !e.daten.zuschauen))
  } finally { await s.schliessen() }
})
