import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { erstelleServer, herkunftOk } from '../server.mjs'
import { figurenSpeicher } from '../spiel/figurenspeicher.mjs'
import { skriptGehirn } from '../tools/skriptgehirne.mjs'
import { MAX_EIGENE } from '../spiel/figurenschema.mjs'

const paula = (extra = {}) => ({
  name: 'Paula', alter: 16, beschreibung: 'Sitzt immer am Fenster und zeichnet Schatten in ihr Heft.',
  stil: 'Leise, mit vielen Pausen.', beispiele: ['Hm. Das war nicht die Tür.'], geheimnis: 'Hat die Glocke verstellt.', ...extra,
})
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nachsitzen-fsrv-'))

async function mitServer(fn, { opt = {} } = {}) {
  const ordner = temp()
  const gesehen = []
  const fabrik = (name, rolle, { zufall: z, figur }) => { gesehen.push({ name, figur }); return skriptGehirn(name, rolle, z) }
  const s = erstelleServer({ gehirnFabrik: fabrik, figuren: figurenSpeicher({ ordner }), port: 0, pause: 0, startwert: 3, ...opt })
  const port = await s.starten()
  const q = (methode, pfad, body, kopf = {}) => fetch(`http://127.0.0.1:${port}${pfad}`, { method: methode, headers: { 'content-type': 'application/json', ...kopf }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
  try { await fn({ q, port, ordner, gesehen, s }) } finally { await s.schliessen() }
}

test('Routen: anlegen, lesen, ersetzen, in den Papierkorb', async () => {
  await mitServer(async ({ q, ordner }) => {
    let r = await q('GET', '/figuren')
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.eigene, []); assert.equal(r.body.mitgeliefert.length, 6); assert.equal(r.body.max, MAX_EIGENE)
    r = await q('POST', '/figuren', { figur: paula() })
    assert.equal(r.status, 200); assert.equal(r.body.figur.kennung, 'paula')
    assert.ok(fs.existsSync(path.join(ordner, 'paula.json')))
    assert.equal((await q('POST', '/figuren', { figur: paula() })).status, 409)
    r = await q('PUT', '/figuren/paula', { figur: paula({ alter: 18 }) })
    assert.equal(r.status, 200); assert.equal(r.body.figur.alter, 18)
    assert.equal((await q('GET', '/figuren')).body.eigene[0].alter, 18)
    r = await q('DELETE', '/figuren/paula')
    assert.equal(r.status, 200); assert.match(r.body.papierkorb, /^paula-\d+\.json$/)
    assert.deepEqual(fs.readdirSync(ordner), ['geloescht'])
    assert.equal((await q('DELETE', '/figuren/paula')).status, 404)
  })
})

test('Routen: Live-Prüfung schreibt nichts und meldet Fehler je Feld', async () => {
  await mitServer(async ({ q, ordner }) => {
    let r = await q('POST', '/figuren/pruefen', { figur: paula() })
    assert.equal(r.body.ok, true); assert.equal(r.body.kennung, 'paula'); assert.equal(r.body.vorhanden, false)
    r = await q('POST', '/figuren/pruefen', { figur: paula({ name: '', beschreibung: 'kurz' }) })
    assert.equal(r.status, 200); assert.equal(r.body.ok, false)
    assert.deepEqual(r.body.fehler.map((f) => f.feld).sort(), ['beschreibung', 'name'])
    assert.deepEqual(fs.existsSync(ordner) ? fs.readdirSync(ordner) : [], [])
    const ungueltig = await q('POST', '/figuren', { figur: paula({ name: '../boese' }) })
    assert.equal(ungueltig.status, 400); assert.ok(ungueltig.body.felder.some((f) => f.feld === 'name'))
  })
})

test('Routen: Pfad-Ausbruch über die Kennung in der URL scheitert', async () => {
  await mitServer(async ({ q, ordner }) => {
    await q('POST', '/figuren', { figur: paula() })
    for (const pfad of ['/figuren/..%2Fpaula', '/figuren/%2e%2e', '/figuren/a%2Fb', '/figuren/PAULA', '/figuren/paula.json']) {
      for (const m of ['PUT', 'DELETE']) {
        const r = await q(m, pfad, { figur: paula() })
        assert.ok([400, 404, 405].includes(r.status), `${m} ${pfad} -> ${r.status}`)
      }
    }
    assert.equal((await q('DELETE', '/figuren/paula/x')).status, 404)
    assert.deepEqual(fs.readdirSync(ordner), ['paula.json'])
  })
})

test('Routen: Höchstzahl eigener Figuren', async () => {
  await mitServer(async ({ q }) => {
    for (let i = 0; i < MAX_EIGENE; i++) assert.equal((await q('POST', '/figuren', { figur: paula({ name: `Figur ${String.fromCharCode(65 + i)}` }) })).status, 200)
    const r = await q('POST', '/figuren', { figur: paula({ name: 'Figur Z' }) })
    assert.equal(r.status, 409); assert.match(r.body.fehler, /Höchstens 12/)
  })
})

test('Routen: Körper über 8000 Bytes -> 413, kein JSON -> 400, falscher Typ -> 415', async () => {
  await mitServer(async ({ q, port, ordner }) => {
    const gross = await q('POST', '/figuren', { figur: paula({ beschreibung: 'x'.repeat(9000) }) })
    assert.equal(gross.status, 413)
    assert.equal((await q('POST', '/figuren', '{kaputt')).status, 400)
    const r = await fetch(`http://127.0.0.1:${port}/figuren`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ figur: paula() }) })
    assert.equal(r.status, 415)
    // Körper ohne Content-Length (chunked) wird beim Lesen begrenzt
    const status = await new Promise((f) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/figuren', method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); f(res.statusCode) })
      req.on('error', () => f(0))
      req.write('{"figur":{"x":"' + 'a'.repeat(5000)); req.write('a'.repeat(5000)); req.end('"}}')
    })
    assert.equal(status, 413)
    assert.deepEqual(fs.existsSync(ordner) ? fs.readdirSync(ordner) : [], [])
  })
})

test('Routen: fremde Herkunft und fremder Host werden abgelehnt', async () => {
  await mitServer(async ({ q, port, ordner }) => {
    for (const kopf of [{ origin: 'https://boese.example' }, { origin: 'http://localhost.boese.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]) {
      assert.equal((await q('POST', '/figuren', { figur: paula() }, kopf)).status, 403, JSON.stringify(kopf))
      assert.equal((await q('GET', '/figuren', undefined, kopf)).status, 403)
      assert.equal((await q('DELETE', '/figuren/paula', undefined, kopf)).status, 403)
    }
    assert.equal((await q('POST', '/figuren', { figur: paula() }, { origin: `http://localhost:${port}` })).status, 200)   // eigene Seite im Browser
    const host = await new Promise((f) => http.get({ host: '127.0.0.1', port, path: '/figuren', headers: { host: 'boese.example' } }, (r) => f(r.statusCode)))
    assert.equal(host, 403)
    assert.deepEqual(fs.readdirSync(ordner), ['paula.json'])
  })
  assert.ok(herkunftOk({})); assert.ok(herkunftOk({ origin: 'http://127.0.0.1:4800', 'sec-fetch-site': 'same-origin' }))
  assert.ok(!herkunftOk({ origin: 'http://127.0.0.1.boese.example' }))
})

test('Routen: ohne Speicher sind die Figuren-Routen aus', async () => {
  const s = erstelleServer({ gehirnFabrik: (n, r, { zufall: z }) => skriptGehirn(n, r, z), port: 0, pause: 0 })
  const port = await s.starten()
  try {
    const r = await fetch(`http://127.0.0.1:${port}/figuren`)
    assert.equal(r.status, 404)
    const p = await fetch(`http://127.0.0.1:${port}/partie`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ zuschauen: true, besetzung: ['Mira', 'Jonas', 'Paula'] }) })
    assert.equal(p.status, 400)
  } finally { await s.schliessen() }
})

test('Partie mit eigener Figur: Skriptgehirne spielen bis zum Ende, Gehirn bekommt die Figurendaten', async () => {
  await mitServer(async ({ q, gesehen, s }) => {
    await q('POST', '/figuren', { figur: paula({ aussehen: { frisur: 'bob', shirt: '#112233' } }) })
    const r = await q('POST', '/partie', { zuschauen: true, besetzung: ['Mira', 'Paula', 'Sam'] })
    assert.equal(r.status, 200)
    assert.deepEqual(Object.keys(r.body.figuren).sort(), ['Ben', 'Mira', 'Paula', 'Sam'])
    assert.equal(r.body.figuren.Paula.frisur, 'bob'); assert.equal(r.body.figuren.Paula.shirt, '#112233')
    assert.deepEqual(s.partie().namen, ['Mira', 'Paula', 'Sam', 'Ben'])
    const paulaGehirn = gesehen.find((g) => g.name === 'Paula')
    assert.equal(paulaGehirn.figur.geheimnis, 'Hat die Glocke verstellt.')
    // bis zum Ende laufen lassen
    for (let i = 0; i < 100 && s.partie().phase !== 'ende'; i++) await new Promise((f) => setTimeout(f, 50))
    assert.equal(s.partie().phase, 'ende')
    assert.ok(['schueler', 'schatten'].includes(s.partie().sieger))
  })
})

test('Besetzung: Grenzen 3 bis 7 KI-Figuren, keine Doppelten, nur bekannte Namen, Spielername nicht doppelt', async () => {
  await mitServer(async ({ q }) => {
    await q('POST', '/figuren', { figur: paula() })
    const probiere = (besetzung, extra = { zuschauen: true }) => q('POST', '/partie', { besetzung, ...extra })
    assert.equal((await probiere(['Mira', 'Jonas'])).status, 400)
    assert.equal((await probiere(['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Paula', 'Mira'])).status, 400)
    assert.equal((await probiere(['Mira', 'mira', 'Lea'])).status, 400)
    assert.equal((await probiere(['Mira', 'Jonas', 'Unbekannt'])).status, 400)
    assert.equal((await probiere(['Mira', 'Jonas', 'Ben'])).status, 400)   // Ben ist der Zuschauer-Ersatz, keine Wahl
    assert.equal((await probiere('Mira')).status, 400)
    assert.equal((await probiere(['Mira', 'Jonas', 'Paula'], { name: 'Paula' })).status, 400)   // Name schon vergeben
    assert.equal((await probiere(['Mira', 'Jonas', 'Lea'], { name: 'Stefan' })).status, 200)       // 3 + Mensch = 4
    assert.equal((await probiere(['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Paula'], { name: 'Stefan' })).status, 200)   // 7 + Mensch = 8
    assert.equal((await q('POST', '/partie', { zuschauen: true })).status, 200)   // ohne Besetzung wie bisher
  })
})

test('Simulation: Besetzungen von 4 bis 8 Figuren mit einer eigenen Figur laufen immer zu Ende', async () => {
  const { spielePartie } = await import('../tools/simuliere.mjs')
  const alle = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Sam', 'Paula', 'Ben']
  for (let n = 4; n <= 8; n++) {
    const namen = ['Paula', ...alle.filter((x) => x !== 'Paula').slice(0, n - 1)]
    for (let start = 1; start <= 20; start++) {
      const p = await spielePartie(start, namen)
      assert.equal(p.phase, 'ende', `${n} Figuren, Startwert ${start}`)
      assert.ok(['schueler', 'schatten'].includes(p.sieger))
      assert.equal(Object.keys(p.rollen).length, n)
    }
  }
})
