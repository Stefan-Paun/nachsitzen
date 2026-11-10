import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { kostenRechner, deckelAusUmgebung, kostenBericht, DECKEL_PRO_TAG } from '../spiel/kosten.mjs'
import { standardOrdner } from '../spiel/ordner.mjs'

const tmpPfad = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ns-kosten-')), 'kosten.json')

test('Deckel aus NACHSITZEN_DECKEL: gueltig, ungueltig mit Warnung, fehlend', () => {
  const w = []
  assert.equal(deckelAusUmgebung({ NACHSITZEN_DECKEL: '1.25' }, (m) => w.push(m)), 1.25)
  assert.equal(deckelAusUmgebung({ NACHSITZEN_DECKEL: '2,5' }, (m) => w.push(m)), 2.5)
  assert.equal(deckelAusUmgebung({}, (m) => w.push(m)), DECKEL_PRO_TAG)
  assert.equal(w.length, 0)
  for (const schlecht of ['0', '-1', 'viel', '1e3x', 'NaN', 'Infinity']) {
    assert.equal(deckelAusUmgebung({ NACHSITZEN_DECKEL: schlecht }, (m) => w.push(m)), DECKEL_PRO_TAG, schlecht)
  }
  assert.equal(w.length, 6)
})

test('kostenRechner nutzt NACHSITZEN_DECKEL aus der Umgebung', () => {
  const alt = process.env.NACHSITZEN_DECKEL
  process.env.NACHSITZEN_DECKEL = '0.0001'
  try {
    const k = kostenRechner({ pfad: tmpPfad() })
    k.buchen({ input_tokens: 10000, output_tokens: 1000 })
    assert.throws(() => k.pruefen(), /Tagesdeckel erreicht/)
  } finally {
    if (alt === undefined) delete process.env.NACHSITZEN_DECKEL; else process.env.NACHSITZEN_DECKEL = alt
  }
})

test('kostenBericht: Tabelle, Fenster von 14 Tagen, Durchschnitt', () => {
  const daten = {
    '2026-10-01': { aufrufe: 99, eingabe: 1, ausgabe: 1, cacheLesen: 0, cacheSchreiben: 0, dollar: 9 },   // zu alt
    '2026-11-08': { aufrufe: 10, eingabe: 1000, ausgabe: 200, cacheLesen: 300, cacheSchreiben: 0, dollar: 0.02 },
    '2026-11-10': { aufrufe: 30, eingabe: 3000, ausgabe: 400, cacheLesen: 0, cacheSchreiben: 100, dollar: 0.04 },
  }
  const text = kostenBericht(daten, { heute: '2026-11-10' })
  assert.ok(!text.includes('2026-10-01'))
  assert.match(text, /2026-11-08\s+10\s+1500\s+2\.00/)
  assert.match(text, /2026-11-10\s+30\s+3500\s+4\.00/)
  assert.match(text, /Summe\s+40\s+5000\s+6\.00/)
  assert.match(text, /Durchschnitt: 0\.150 Cent pro Aufruf/)
  assert.match(kostenBericht({}, { heute: '2026-11-10' }), /Keine Verbrauchsdaten/)
  // Randtag: genau 13 Tage zurueck zaehlt noch, 14 nicht
  const r = kostenBericht({ '2026-10-28': { aufrufe: 1, dollar: 0.01 }, '2026-10-27': { aufrufe: 1, dollar: 0.01 } }, { heute: '2026-11-10' })
  assert.ok(r.includes('2026-10-28') && !r.includes('2026-10-27'))
})

test('standardOrdner: XDG, Windows, Standard', () => {
  assert.equal(standardOrdner({ plattform: 'darwin', env: {}, heim: '/h' }), path.join('/h', '.local', 'share', 'nachsitzen'))
  assert.equal(standardOrdner({ plattform: 'linux', env: { XDG_DATA_HOME: '/x' }, heim: '/h' }), path.join('/x', 'nachsitzen'))
  assert.equal(standardOrdner({ plattform: 'win32', env: { LOCALAPPDATA: 'L' }, heim: '/h' }), path.join('L', 'nachsitzen'))
  assert.equal(standardOrdner({ plattform: 'win32', env: { LOCALAPPDATA: 'L', XDG_DATA_HOME: '/x' }, heim: '/h' }), path.join('/x', 'nachsitzen'))
  assert.equal(standardOrdner({ plattform: 'win32', env: {}, heim: '/h' }), path.join('/h', 'AppData', 'Local', 'nachsitzen'))
})
