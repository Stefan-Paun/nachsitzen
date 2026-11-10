import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pruefeFigur, kennung, GRENZEN, MAX_EIGENE, MITGELIEFERT } from '../spiel/figurenschema.mjs'
import { figurenSpeicher, figurenOrdner, FigurenFehler } from '../spiel/figurenspeicher.mjs'

const HIER = path.dirname(new URL(import.meta.url).pathname)
const gueltig = (extra = {}) => ({
  name: 'Paula', alter: 16,
  beschreibung: 'Sitzt immer am Fenster und zeichnet Schatten in ihr Heft, auch jetzt.',
  stil: 'Leise, mit vielen Pausen. Sagt gern „hm“.',
  beispiele: ['Hm. Das war nicht die Tür.', 'Ich zeichne nur, was ich sehe.'],
  geheimnis: 'Hat die Schulglocke einmal absichtlich verstellt.',
  ...extra,
})
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nachsitzen-figuren-'))
const felder = (r) => r.fehler.map((f) => f.feld)

test('Schema: alle mitgelieferten Figuren bestehen die Prüfung', () => {
  for (const n of MITGELIEFERT) {
    const roh = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'figuren', `${n.toLowerCase()}.json`), 'utf8'))
    const r = pruefeFigur(roh, { eingebaut: true })
    assert.ok(r.ok, `${n}: ${JSON.stringify(r.fehler)}`)
    assert.equal(r.figur.name, roh.name)
    assert.deepEqual(r.figur.beispiele, roh.beispiele)
  }
})

test('Schema: gültige Figur, Standardwerte werden ergänzt', () => {
  const r = pruefeFigur({ name: 'Paula', beschreibung: gueltig().beschreibung, stil: gueltig().stil, beispiele: ['Hm, na gut.'] })
  assert.ok(r.ok, JSON.stringify(r.fehler))
  assert.equal(r.figur.alter, 17)
  assert.equal(r.figur.aussehen.frisur, 'kurz')
  assert.equal(r.figur.geheimnis, undefined)
})

test('Schema: Pflichtfelder fehlen', () => {
  const r = pruefeFigur({})
  assert.equal(r.ok, false)
  assert.deepEqual(felder(r).sort(), ['beispiele', 'beschreibung', 'name', 'stil'])
  assert.equal(pruefeFigur(null).ok, false)
  assert.equal(pruefeFigur([]).ok, false)
})

test('Schema: unbekannte Felder werden abgelehnt', () => {
  const r = pruefeFigur(gueltig({ rolle: 'schatten' }))
  assert.equal(r.ok, false)
  assert.ok(felder(r).includes('rolle'))
  assert.equal(pruefeFigur(gueltig({ aussehen: { hut: '#ffffff' } })).ok, false)
})

test('Schema: Längen an den Grenzen', () => {
  assert.ok(pruefeFigur(gueltig({ name: 'A'.repeat(GRENZEN.name.max) })).ok)
  assert.ok(felder(pruefeFigur(gueltig({ name: 'A'.repeat(GRENZEN.name.max + 1) }))).includes('name'))
  assert.ok(felder(pruefeFigur(gueltig({ name: 'A' }))).includes('name'))
  assert.ok(pruefeFigur(gueltig({ beschreibung: 'x'.repeat(400) })).ok)
  assert.ok(felder(pruefeFigur(gueltig({ beschreibung: 'x'.repeat(401) }))).includes('beschreibung'))
  assert.ok(felder(pruefeFigur(gueltig({ stil: 'x'.repeat(301) }))).includes('stil'))
  assert.ok(felder(pruefeFigur(gueltig({ geheimnis: 'x'.repeat(201) }))).includes('geheimnis'))
  assert.ok(felder(pruefeFigur(gueltig({ beispiele: ['a b c d', 'x', 'y', 'z'].map((t, i) => t + i.toString().repeat(5)) }))).includes('beispiele'))   // vier Stück
  assert.ok(felder(pruefeFigur(gueltig({ beispiele: [] }))).includes('beispiele'))
  assert.ok(felder(pruefeFigur(gueltig({ beispiele: ['x'.repeat(161)] }))).includes('beispiele'))
  assert.ok(felder(pruefeFigur(gueltig({ alter: 11 }))).includes('alter'))
  assert.ok(felder(pruefeFigur(gueltig({ alter: 'abc' }))).includes('alter'))
})

test('Schema: Namen – Zeichen, reservierte Wörter, Steuerzeichen', () => {
  for (const schlecht of ['../etc', 'a/b', 'Max<b>', 'Max\u0000', '1Max', '-Max', 'Max;Moritz', 'Mira', 'mira', 'Mïra', 'Tür', 'niemand', 'Klassenbuch', 'Ben', 'Ж Ж']) {
    assert.equal(pruefeFigur(gueltig({ name: schlecht })).ok, false, schlecht)
  }
  for (const gut of ['Zoë', "O'Neil", 'Anna-Lena', 'Max 2', 'Jürgen']) assert.ok(pruefeFigur(gueltig({ name: gut })).ok, gut)
})

test('Schema: Steuerzeichen und Markierungen in Freitexten', () => {
  for (const f of ['beschreibung', 'stil', 'geheimnis']) {
    for (const boese of ['Text\u0007mit Klingel', 'Text mit <b>Tag', 'Text {{name}} Platzhalter', 'Text » Ende «', 'Text ‮ umgedreht', 'Text `code`']) {
      assert.equal(pruefeFigur(gueltig({ [f]: boese.padEnd(30, '.') })).ok, false, `${f}: ${boese}`)
    }
  }
  assert.equal(pruefeFigur(gueltig({ beispiele: ['gut so', 'schlecht {{x}}'] })).ok, false)
  // Zeilenumbrüche werden zu Leerzeichen
  assert.equal(pruefeFigur(gueltig({ beschreibung: 'Erste Zeile hier.\n\nZweite Zeile hier.' })).figur.beschreibung, 'Erste Zeile hier. Zweite Zeile hier.')
})

test('Schema: Aussehen – Farben und Frisur', () => {
  assert.ok(pruefeFigur(gueltig({ aussehen: { haut: '#AABBCC', frisur: 'bob' } })).ok)
  assert.equal(pruefeFigur(gueltig({ aussehen: { haut: 'rot' } })).ok, false)
  assert.equal(pruefeFigur(gueltig({ aussehen: { haut: 'url(x)' } })).ok, false)
  assert.equal(pruefeFigur(gueltig({ aussehen: { frisur: 'glatze' } })).ok, false)
})

test('Kennung: nur a-z, 0-9 und Bindestrich, nie Pfadteile', () => {
  assert.equal(kennung('Paula'), 'paula')
  assert.equal(kennung('Zoë Müller'), 'zoe-muller')
  assert.equal(kennung('Straße'), 'strasse')
  assert.equal(kennung('../../etc/passwd'), 'etc-passwd')
  assert.equal(kennung('..'), '')
  assert.equal(kennung('A'.repeat(40)).length, 24)
  assert.equal(kennung(null), '')
})

test('Speicher: anlegen, lesen, ersetzen, Datei liegt nur im Ordner', () => {
  const ordner = temp()
  const s = figurenSpeicher({ ordner })
  const f = s.anlegen(gueltig())
  assert.equal(f.kennung, 'paula')
  assert.deepEqual(fs.readdirSync(ordner), ['paula.json'])
  assert.equal(s.lesen('paula').name, 'Paula')
  assert.equal(s.vonName('PAULA').kennung, 'paula')
  s.ersetzen('paula', gueltig({ alter: 18 }))
  assert.equal(s.lesen('paula').alter, 18)
  assert.equal(s.liste().figuren.length, 1)
  assert.throws(() => s.anlegen(gueltig()), (e) => e.status === 409)
  assert.throws(() => s.ersetzen('paula', gueltig({ name: 'Paulo' })), (e) => e.status === 400)
  assert.throws(() => s.ersetzen('niemand-da', gueltig({ name: 'Niemand Da' })), (e) => e.status === 404)
})

test('Speicher: Pfad-Ausbruch mit ../ scheitert', () => {
  const ordner = temp()
  const s = figurenSpeicher({ ordner: path.join(ordner, 'figuren') })
  // Name mit ../ ist schon im Schema ungültig
  assert.throws(() => s.anlegen(gueltig({ name: '../boese' })), (e) => e instanceof FigurenFehler && e.fehler.some((x) => x.feld === 'name'))
  // Kennungen mit Pfadteilen werden nie in einen Pfad verwandelt
  for (const k of ['../x', '..', 'a/b', 'a\\b', '', 'A', 'x.json', 'x\u0000', '-x', 'x'.repeat(30), 'geloescht/x', null, undefined, {}]) {
    assert.throws(() => s.lesen(k) ?? s.ersetzen(k, gueltig()), FigurenFehler, String(k))
    assert.throws(() => s.loeschen(k), FigurenFehler, String(k))
  }
  assert.deepEqual(fs.readdirSync(ordner), [])   // nichts außerhalb entstanden
})

test('Speicher: Papierkorb verschiebt in geloescht', () => {
  const ordner = temp()
  const s = figurenSpeicher({ ordner, jetzt: () => 1234 })
  s.anlegen(gueltig())
  const weg = s.loeschen('paula')
  assert.equal(weg, 'paula-1234.json')
  assert.deepEqual(fs.readdirSync(ordner).sort(), ['geloescht'])
  assert.deepEqual(fs.readdirSync(path.join(ordner, 'geloescht')), ['paula-1234.json'])
  assert.equal(s.liste().figuren.length, 0)
  assert.throws(() => s.loeschen('paula'), (e) => e.status === 404)
  // gleiche Figur nochmal anlegen und löschen: überschreibt nicht, sondern bekommt anderen Zeitstempel
  s.anlegen(gueltig())
})

test('Speicher: Höchstzahl eigener Figuren', () => {
  const s = figurenSpeicher({ ordner: temp() })
  for (let i = 0; i < MAX_EIGENE; i++) s.anlegen(gueltig({ name: `Figur ${String.fromCharCode(65 + i)}` }))
  assert.throws(() => s.anlegen(gueltig({ name: 'Figur Z' })), (e) => e.status === 409 && /Höchstens 12/.test(e.message))
})

test('Speicher: kaputte, fremde und zu große Dateien werden übersprungen', () => {
  const ordner = temp()
  const s = figurenSpeicher({ ordner })
  s.anlegen(gueltig())
  fs.writeFileSync(path.join(ordner, 'kaputt.json'), '{nicht json')
  fs.writeFileSync(path.join(ordner, 'falsch.json'), JSON.stringify(gueltig({ name: 'Anders' })))   // Kennung passt nicht zum Namen
  fs.writeFileSync(path.join(ordner, 'gross.json'), JSON.stringify({ ...gueltig({ name: 'Gross' }), beschreibung: 'x'.repeat(20_000) }))
  fs.writeFileSync(path.join(ordner, 'notiz.txt'), 'egal')
  const { figuren, kaputt } = s.liste()
  assert.deepEqual(figuren.map((f) => f.kennung), ['paula'])
  assert.deepEqual(kaputt.sort(), ['falsch', 'gross', 'kaputt'])
})

test('Speicher: Standardordner liegt neben den Heften und folgt XDG_DATA_HOME', () => {
  const alt = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = '/tmp/xdg-test'
  try { assert.equal(figurenOrdner(), path.join('/tmp/xdg-test', 'nachsitzen', 'figuren')) } finally { if (alt === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = alt }
})

test('Besetzung (Oberfläche): Zähler, Formular <-> Figur, Kopiename', async () => {
  const B = await import('../public/besetzung.js')
  assert.equal(B.pruefeBesetzung(2).ok, false); assert.match(B.pruefeBesetzung(2).text, /noch 1 Figur /)
  assert.equal(B.pruefeBesetzung(3).ok, true); assert.equal(B.pruefeBesetzung(7).ok, true); assert.equal(B.pruefeBesetzung(8).ok, false)
  assert.match(B.pruefeBesetzung(6).text, /7 im Raum/)
  const f = B.formularZuFigur({ ...B.LEER, name: 'Paula', beschreibung: gueltig().beschreibung, stil: gueltig().stil, b1: ' Hm, na gut. ', b2: '', b3: 'Na gut, dann.', alter: '' })
  assert.deepEqual(f.beispiele, ['Hm, na gut.', 'Na gut, dann.']); assert.equal('alter' in f, false); assert.equal('geheimnis' in f, false)
  assert.ok(pruefeFigur(f).ok, JSON.stringify(pruefeFigur(f).fehler))   // das Formular erzeugt Figuren, die das Schema annimmt
  const zurueck = B.figurZuFormular(pruefeFigur(gueltig()).figur)
  assert.equal(zurueck.b2, 'Ich zeichne nur, was ich sehe.'); assert.equal(zurueck.alter, '16')
  assert.equal(B.kopieName('Paula', ['Paula']), 'Paula 2')
  assert.equal(B.kopieName('Paula 2', ['Paula', 'Paula 2']), 'Paula 3')
  assert.ok(B.kopieName('A'.repeat(20), []).length <= 20)
  assert.deepEqual(B.fehlerJeFeld([{ feld: 'name', text: 'x' }, { feld: 'beispiele', text: 'y' }]), { name: ['x'], b1: ['y'] })
  assert.match(B.farbeFuer('Paula'), /^hsl\(\d+ 60% 68%\)$/)
})
