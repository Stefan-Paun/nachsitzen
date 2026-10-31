import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { claudeGehirn, ladeFigur, systemPrompt, werkzeuge, verlaufAlsText } from '../spiel/gehirn.mjs'
import { SCHATTEN, SCHLUESSEL, SCHUELER } from '../spiel/rollen.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora']

test('Alle fuenf Figuren laden und haben Name, Beschreibung, Stil, 3 Beispiele', () => {
  for (const n of FIGUREN) {
    const f = ladeFigur(n)
    assert.equal(f.name, n)
    assert.ok(f.beschreibung.length > 50 && f.stil.length > 20)
    assert.equal(f.beispiele.length, 3)
  }
})

test('Systemprompt: nur die eigene Rolle, Grenzen drin, Platzhalter ersetzt', () => {
  const f = ladeFigur('Nora')
  const s = systemPrompt(f, SCHATTEN, NAMEN, 'Stefan')
  assert.ok(s.includes('Du bist der Schatten'))
  assert.ok(!s.includes('Du bist der Schlüsselträger'))
  assert.ok(!s.includes('{{'))
  assert.ok(s.includes('kein Blut') && s.includes('Suizid'))
  assert.ok(s.includes('Stefan ist ein echter Mitschüler'))
  assert.ok(s.includes('Mitspieler: Mira, Jonas, Lea, Tarik, Stefan'))
  const s2 = systemPrompt(f, SCHUELER, NAMEN, null)
  assert.ok(s2.includes('Du bist ein normaler Schüler') && !s2.includes('echter Mitschüler'))
})

test('Werkzeuge je Phase und Rolle, Namen als enum', () => {
  const andere = ['Mira', 'Jonas']
  assert.deepEqual(werkzeuge('abend', SCHUELER, andere).map((t) => t.name), ['sprechen'])
  assert.deepEqual(werkzeuge('diskussion', SCHATTEN, andere).map((t) => t.name), ['sprechen', 'schweigen'])
  assert.deepEqual(werkzeuge('nacht', SCHATTEN, andere).map((t) => t.name), ['holen'])
  assert.deepEqual(werkzeuge('nacht', SCHLUESSEL, andere).map((t) => t.name), ['pruefen'])
  assert.deepEqual(werkzeuge('nacht', SCHUELER, andere).map((t) => t.name), ['verstecken'])
  assert.deepEqual(werkzeuge('nacht', SCHATTEN, andere)[0].input_schema.required, ['platz', 'ziel'])
  assert.equal(werkzeuge('nacht', SCHUELER, andere)[0].input_schema.properties.platz.enum.length, 6)
  const ab = werkzeuge('abstimmung', SCHUELER, andere)[0]
  assert.deepEqual(ab.input_schema.properties.fuer.enum, ['Mira', 'Jonas', 'niemand'])
  assert.ok(werkzeuge('nacht', SCHATTEN, andere)[0].strict)
})

test('Verlauf als Text: private Zeilen nur in der eigenen Sicht, "Du" statt Name', () => {
  const p = P.neuePartie(NAMEN, zufall(3))
  P.sprechen(p, 'Mira', 'Wer war beim Fenster?', 'Jonas')
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  const opfer = NAMEN.find((n) => n !== s && n !== k)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i]))
  P.schattenWaehlt(p, opfer); P.schluesselPrueft(p, s); P.morgen(p)
  const tS = verlaufAlsText(P.verlaufFuer(p, s), s), tK = verlaufAlsText(P.verlaufFuer(p, k), k), tO = verlaufAlsText(P.verlaufFuer(p, 'Mira'), 'Mira')
  assert.ok(tS.includes(`Du schleichst zu ${opfer}`)); assert.ok(!tK.includes('Du schleichst zu'))
  assert.ok(tK.includes('Du stellst dich') && tK.includes('was du mitbekommen hast') && tK.includes('Fund für alle sichtbar'))
  assert.ok(tK.includes(`Du prüfst ${s}: DER SCHATTEN.`)); assert.ok(!tS.includes('Du prüfst'))
  assert.ok(tO.includes('Du (zu Jonas): Wer war beim Fenster?'))
  assert.ok(tS.includes(`Das Pult von ${opfer} ist leer`))
})

function fakeAnfrage(antworten) {
  const aufrufe = []
  return { aufrufe, anfrage: async (req) => { aufrufe.push(req); const a = antworten.shift(); return typeof a === 'function' ? a(req) : a } }
}

test('Claude-Gehirn: Werkzeug-Aufruf wird zur Aktion, Ziel wird geprueft, Text gekuerzt', async () => {
  const p = P.neuePartie(NAMEN, zufall(4))
  const { aufrufe, anfrage } = fakeAnfrage([
    { werkzeug: { name: 'sprechen', eingabe: { text: 'Tarik, du warst nicht an deinem Platz.', an: 'Tarik' } } },
    { werkzeug: { name: 'sprechen', eingabe: { text: 'x'.repeat(1000), an: 'Niemand-Existiert' } } },
    { werkzeug: { name: 'abstimmen', eingabe: { fuer: 'niemand', begruendung: 'Zu wenig.' } } },
    { werkzeug: { name: 'abstimmen', eingabe: { fuer: 'Mira', begruendung: 'Sie lenkt ab.' } } },
  ])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, spieler: 'Stefan', zufall: zufall(1) })
  p.phase = 'diskussion'
  const a1 = await g.diskussion(P.verlaufFuer(p, 'Lea'), p.lebende)
  assert.deepEqual(a1, { art: 'sagt', text: 'Tarik, du warst nicht an deinem Platz.', an: 'Tarik' })
  assert.ok(aufrufe[0].system.includes('Du bist Lea'))
  assert.ok(aufrufe[0].nachricht.includes('Noch im Raum: Mira, Jonas, Lea, Tarik, Nora, Stefan'))
  assert.deepEqual(aufrufe[0].tools.map((t) => t.name), ['sprechen', 'schweigen'])
  const a2 = await g.diskussion([], p.lebende)
  assert.equal(a2.text.length, 400); assert.equal(a2.an, null)
  const a3 = await g.abstimmung([], p.lebende)
  assert.deepEqual(a3, { art: 'stimme', fuer: null, begruendung: 'Zu wenig.' })
  const a4 = await g.abstimmung([], p.lebende)
  assert.equal(a4.fuer, 'Mira')
})

test('Claude-Gehirn: Ablehnung, Fehler und falsches Werkzeug fallen harmlos zurueck', async () => {
  const log = []
  const { anfrage } = fakeAnfrage([
    { werkzeug: null, grund: 'refusal', kategorie: 'general_harms' },
    () => { throw new Error('Netz weg') },
    { werkzeug: { name: 'holen', eingabe: { platz: 'Tür', ziel: 'Mira' } } },   // in der Diskussion nicht erlaubt
    { werkzeug: { name: 'holen', eingabe: { platz: 'Tür', ziel: 'Lea' } } },    // sich selbst holen geht nicht
    { werkzeug: { name: 'sprechen', eingabe: { text: '', an: null } } },
  ])
  const g = claudeGehirn(ladeFigur('Lea'), SCHATTEN, { anfrage, mitspieler: NAMEN, zufall: zufall(2), log: (m) => log.push(m) })
  const lebende = ['Mira', 'Lea', 'Nora']
  assert.deepEqual(await g.diskussion([], lebende), { art: 'schweigt' })
  assert.deepEqual(await g.diskussion([], lebende), { art: 'schweigt' })
  assert.deepEqual(await g.diskussion([], lebende), { art: 'schweigt' })
  const n = await g.nacht([], lebende)
  assert.ok(['Mira', 'Nora'].includes(n.ziel)); assert.ok(P.ORT_NAMEN.includes(n.platz))
  assert.deepEqual(await g.abend([], lebende), { art: 'sagt', text: 'Ist hier noch jemand wach?', an: null })
  assert.equal(log.length, 5)
  assert.ok(log.some((m) => m.includes('refusal')) && log.some((m) => m.includes('Netz weg')))
})

test('Nacht-Werkzeuge: Schatten kann sich nicht selbst waehlen (enum ohne eigenen Namen)', () => {
  const t = werkzeuge('nacht', SCHATTEN, ['Mira', 'Nora'])[0]
  assert.ok(!t.input_schema.properties.ziel.enum.includes('Lea'))
})

test('Claude-Gehirn: echte Nacht-Antwort wird zu Platz und Ziel; Untersuchen braucht keinen API-Aufruf', async () => {
  let aufrufe = 0
  const anfrage = async () => { aufrufe++; return { werkzeug: { name: 'pruefen', eingabe: { platz: 'Fenster', ziel: 'Mira' } } } }
  const g = claudeGehirn(ladeFigur('Nora'), SCHLUESSEL, { anfrage, mitspieler: NAMEN, zufall: zufall(9) })
  assert.deepEqual(await g.nacht([], ['Nora', 'Mira', 'Lea'], { orte: P.ORT_NAMEN }), { platz: 'Fenster', ziel: 'Mira' })
  const sicht = [{ art: 'fund', text: 'Kreidestaub an der Tafel, als wäre jemand nur durchgegangen.' }]
  const ergebnisse = new Set()
  for (let i = 0; i < 40; i++) { const u = g.untersuchen(sicht, NAMEN, { orte: [...P.ORT_NAMEN, 'Klassenbuch'] }); if (u) ergebnisse.add(u.ort) }
  assert.ok(ergebnisse.has('Tafel'), 'folgt dem Fund'); assert.ok(ergebnisse.size >= 2)
  assert.equal(aufrufe, 1)
})
