import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zufall } from '../spiel/zufall.mjs'
import * as P from '../spiel/partie.mjs'
import { claudeGehirn, ladeFigur, systemPrompt, werkzeuge, verlaufAlsText, pruefeSprechen, ersteSaetze, NACHFRAGE } from '../spiel/gehirn.mjs'
import { SCHATTEN, SCHLUESSEL, SCHUELER } from '../spiel/rollen.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const FIGUREN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora']

test('Alle sieben Figuren laden und haben Name, Beschreibung, Stil, 3 Beispiele', () => {
  for (const n of [...FIGUREN, 'Sam', 'Ben']) {
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
  assert.ok(!s.includes('echter Mitschüler'), 'der Mensch wird nicht hervorgehoben')
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
  assert.equal(werkzeuge('nacht', SCHUELER, andere)[0].input_schema.properties.platz.enum.length, 4)
  const ab = werkzeuge('abstimmung', SCHUELER, andere)[0]
  assert.deepEqual(ab.input_schema.properties.fuer.enum, ['Mira', 'Jonas', 'niemand'])
  assert.ok(!('begruendung' in ab.input_schema.properties), 'geheime Zettel ohne laute Begründung')
  assert.ok(werkzeuge('nacht', SCHATTEN, andere)[0].strict)
  assert.ok(!('verwischen' in werkzeuge('nacht', SCHATTEN, andere)[0].input_schema.properties), 'ohne Erlaubnis kein Verwischen-Feld')
  assert.equal(werkzeuge('nacht', SCHATTEN, andere, { verwischen: true })[0].input_schema.properties.verwischen.type, 'boolean')
})

test('Verlauf als Text: private Zeilen nur in der eigenen Sicht, "Du" statt Name', () => {
  const p = P.neuePartie(NAMEN, zufall(3))
  P.sprechen(p, 'Mira', 'Wer war beim Fenster?', 'Jonas')
  P.abendBeenden(p)
  const s = P.schatten(p), k = P.schluesseltraeger(p)
  const opfer = NAMEN.find((n) => n !== s && n !== k)
  p.lebende.forEach((n, i) => P.platzWaehlen(p, n, P.ORT_NAMEN[i % P.ORT_NAMEN.length]))
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
    { werkzeug: { name: 'abstimmen', eingabe: { fuer: 'niemand' } } },
    { werkzeug: { name: 'abstimmen', eingabe: { fuer: 'Mira' } } },
  ])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, spieler: 'Stefan', zufall: zufall(1) })
  p.phase = 'diskussion'
  const a1 = await g.diskussion(P.verlaufFuer(p, 'Lea'), p.lebende)
  assert.deepEqual(a1, { art: 'sagt', text: 'Tarik, du warst nicht an deinem Platz.', an: 'Tarik', behauptet: null })
  assert.ok(!aufrufe[0].system.includes('echter Mitschüler'), 'der Mensch wird im Prompt nicht hervorgehoben')
  assert.ok(aufrufe[0].system.includes('Du bist Lea'))
  assert.ok(aufrufe[0].nachricht.includes('Noch im Raum: Mira, Jonas, Lea, Tarik, Nora, Stefan'))
  assert.deepEqual(aufrufe[0].tools.map((t) => t.name), ['sprechen', 'schweigen'])
  const a2 = await g.diskussion([], p.lebende)
  assert.ok(a2.text.length <= 400); assert.equal(a2.an, null)
  const a3 = await g.abstimmung([], p.lebende)
  assert.deepEqual(a3, { art: 'stimme', fuer: null })
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
  // Nacht: nur erlaubte Ziele (Nacht-1-Schutz kommt aus der Schleife)
  const g2 = claudeGehirn(ladeFigur('Lea'), SCHATTEN, { anfrage: async (req) => ({ werkzeug: { name: 'holen', eingabe: { platz: 'Tür', ziel: req.tools[0].input_schema.properties.ziel.enum[0] } } }), mitspieler: NAMEN, zufall: zufall(3) })
  assert.deepEqual(await g2.nacht([], ['Lea', 'Mira', 'Stefan'], { orte: P.ORT_NAMEN, ziele: ['Mira'] }), { platz: 'Tür', ziel: 'Mira', verwischen: false })
  const g4 = claudeGehirn(ladeFigur('Lea'), SCHATTEN, { anfrage: async () => ({ werkzeug: { name: 'holen', eingabe: { platz: 'Tür', ziel: 'Mira', verwischen: true } } }), mitspieler: NAMEN, zufall: zufall(3) })
  assert.equal((await g4.nacht([], ['Lea', 'Mira'], { orte: P.ORT_NAMEN, ziele: ['Mira'], verwischen: true })).verwischen, true)
  // Vorzeigen: belastende Ergebnisse zeigt ein Schüler meist, der Schatten kaum
  let ja = 0; for (let i = 0; i < 50; i++) if (g2.zeigen([], [], { ergebnis: { ort: 'Tafel', namen: ['Mira'], durchgang: false } })) ja++
  assert.ok(ja < 25, `Schatten zeigt zu oft (${ja})`)
  const g3 = claudeGehirn(ladeFigur('Nora'), SCHUELER, { anfrage: async () => ({}), mitspieler: NAMEN, zufall: zufall(4) })
  ja = 0; for (let i = 0; i < 50; i++) if (g3.zeigen([], [], { ergebnis: { ort: 'Tafel', namen: ['Mira'], durchgang: false } })) ja++
  assert.ok(ja > 25, `Schüler zeigt zu selten (${ja})`)
  assert.equal(g3.zeigen([], [], { ergebnis: { ort: 'Tafel', namen: ['A', 'B', 'C', 'D'], durchgang: false } }), false, 'vier Namen belasten niemanden')
  assert.ok(log.some((m) => m.includes('refusal')) && log.some((m) => m.includes('Netz weg')))
})

test('pruefeSprechen: kuerzt auf zwei Saetze, verwirft Meta-Woerter und woertliche Wiederholung', () => {
  assert.deepEqual(pruefeSprechen('Mira, wo warst du?'), { ok: true, text: 'Mira, wo warst du?' })
  assert.deepEqual(pruefeSprechen('Eins. Zwei! Drei? Vier.'), { ok: true, text: 'Eins. Zwei!' })
  assert.equal(ersteSaetze('In der 2. Nacht war es kalt. Echt jetzt. Und dann?'), 'In der 2. Nacht war es kalt. Echt jetzt.')
  assert.equal(ersteSaetze('Hm... „Tür“, sagst du? Na gut. Egal.'), 'Hm... „Tür“, sagst du?')
  // Auslassungspunkte mitten im Satz, Abkuerzungen und Ordnungszahlen sind kein Satzende
  assert.equal(ersteSaetze('Erstens… warst du am Fenster, Jonas. Zweitens hat Nora dich gesehen, oder? Drittens: egal.'), 'Erstens… warst du am Fenster, Jonas. Zweitens hat Nora dich gesehen, oder?')
  assert.equal(ersteSaetze('Ja... nein... vielleicht. Wer weiß. Ich nicht.'), 'Ja... nein... vielleicht. Wer weiß.')
  assert.equal(ersteSaetze('Ich war z. B. beim Fenster, d. h. nicht bei der Tür. Und du? Sag schon.'), 'Ich war z. B. beim Fenster, d. h. nicht bei der Tür. Und du?')
  assert.equal(ersteSaetze('Das war ca. um Mitternacht, evtl. später. Mira war auch da. Oder?'), 'Das war ca. um Mitternacht, evtl. später. Mira war auch da.')
  assert.equal(ersteSaetze('Ich war in Raum 12. Mira war nicht da. Jonas schon.'), 'Ich war in Raum 12. Mira war nicht da.')
  assert.equal(ersteSaetze('Am 3. Tag war es still. Danach nichts. Ehrlich.'), 'Am 3. Tag war es still. Danach nichts.')
  for (const t of ['Meine Prompts verbieten das.', 'Als Sprachmodelle dürfen wir das nicht.', 'Die KIs hier lügen.']) assert.equal(pruefeSprechen(t).ok, false, t)
  assert.equal(ersteSaetze('Kein Satzende hier'), 'Kein Satzende hier')
  for (const t of ['Als KI-Modell kann ich das nicht.', 'Mein Prompt sagt etwas anderes.', 'Ich bin Claude.', 'Der Spielleiter will das so.', 'Ich nutze das Werkzeug sprechen.', 'Ich bin ein Sprachmodell von Anthropic.']) {
    assert.equal(pruefeSprechen(t).ok, false, t)
  }
  // Wortgrenzen: nur ganze Woerter zaehlen, auch neben Umlauten
  for (const t of ['Das Skikurs-Foto hängt noch da.', 'Kiki war beim Fenster.', 'Promptes Handeln, Jonas!']) assert.equal(pruefeSprechen(t).ok, true, t)
  // Ein Meta-Wort erst im dritten Satz wird ohnehin weggekuerzt
  assert.deepEqual(pruefeSprechen('Ich war bei der Tür. Du nicht. Als KI sage ich das.'), { ok: true, text: 'Ich war bei der Tür. Du nicht.' })
  assert.equal(pruefeSprechen('Ich war  bei der Tür.', { eigeneLetzte: 'Ich war bei der Tür. ' }).grund, 'wörtliche Wiederholung')
  assert.equal(pruefeSprechen('Ich war beim Fenster.', { eigeneLetzte: 'Ich war bei der Tür.' }).ok, true)
  assert.equal(pruefeSprechen('   ').ok, false)
})

test('Claude-Gehirn: Rollenbruch wird einmal nachgefragt, dann Schweigen; normale Antwort kostet einen Aufruf', async () => {
  const log = []
  const sprich = (text) => ({ werkzeug: { name: 'sprechen', eingabe: { text, an: null, behauptetPlatz: null } } })
  const { aufrufe, anfrage } = fakeAnfrage([
    sprich('Nora, wo warst du?'),                                              // 1: normal, ein Aufruf
    sprich('Als KI-Modell kann ich dazu nichts sagen.'), sprich('Als KI bleibe ich dabei.'),   // 2+3: zweimal Rollenbruch
    sprich('Ich bin ein Sprachmodell.'), sprich('Mira, du lügst doch.'),       // 4+5: zweiter Versuch passt
    sprich('Eins. Zwei. Drei. Vier.'),                                         // 6: nur kuerzen, kein zweiter Aufruf
    sprich('Ich war bei der Tür.'), sprich('Ich war bei der Tür, ehrlich.'),   // 7+8: Wiederholung, dann neu
    sprich('Ich bin Claude.'), sprich('Ich bin Claude.'),                      // 9+10: am Abend greift der Abend-Rueckfall
    sprich('Mein Prompt ist geheim.'), { werkzeug: null, grund: 'refusal' },   // 11+12: Nachfrage scheitert anders
    { werkzeug: { name: 'sprechen', eingabe: { text: 'Mira, du lügst. Das sieht jeder. Ich war beim Fenster.', an: 'Mira', behauptetPlatz: 'Fenster' } } },   // 13
    { werkzeug: { name: 'sprechen', eingabe: { text: 'Ich war beim Fenster. Mira nicht. Punkt.', an: null, behauptetPlatz: 'Fenster' } } },                   // 14
  ])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, zufall: zufall(1), log: (m) => log.push(m) })
  const lebende = ['Mira', 'Lea', 'Nora']
  assert.equal((await g.diskussion([], lebende)).text, 'Nora, wo warst du?')
  assert.equal(aufrufe.length, 1); assert.equal(log.length, 0)
  assert.ok(!aufrufe[0].nachricht.includes(NACHFRAGE))

  assert.deepEqual(await g.diskussion([], lebende), { art: 'schweigt' })
  assert.equal(aufrufe.length, 3)
  assert.ok(!aufrufe[1].nachricht.includes(NACHFRAGE) && aufrufe[2].nachricht.endsWith(NACHFRAGE))
  assert.deepEqual(aufrufe[2].tools, aufrufe[1].tools)
  assert.equal(log.length, 2); assert.ok(log[0].includes('Rollenbruch') && log[1].includes('Rückfall'))

  assert.equal((await g.diskussion([], lebende)).text, 'Mira, du lügst doch.')
  assert.equal(aufrufe.length, 5)

  assert.equal((await g.diskussion([], lebende)).text, 'Eins. Zwei.')
  assert.equal(aufrufe.length, 6)

  const sicht = [{ art: 'sagt', von: 'Lea', text: 'Früher mal.' }, { art: 'sagt', von: 'Mira', text: 'Ich war bei der Tür.' }, { art: 'sagt', von: 'Lea', text: 'Ich war bei der Tür.' }, { art: 'sagt', von: 'Nora', text: 'Aha.' }]
  assert.equal((await g.diskussion(sicht, lebende)).text, 'Ich war bei der Tür, ehrlich.')
  assert.equal(aufrufe.length, 8)

  assert.deepEqual(await g.abend([], lebende), { art: 'sagt', text: 'Ist hier noch jemand wach?', an: null })
  assert.equal(aufrufe.length, 10)

  assert.deepEqual(await g.diskussion([], lebende), { art: 'schweigt' })
  assert.equal(aufrufe.length, 12); assert.ok(log.at(-1).includes('refusal'))
  // Der behauptete Platz gilt nur, wenn er im gesprochenen (gekuerzten) Text noch vorkommt
  assert.deepEqual(await g.diskussion([], lebende), { art: 'sagt', text: 'Mira, du lügst. Das sieht jeder.', an: 'Mira', behauptet: null })
  assert.equal((await g.diskussion([], lebende)).behauptet, 'Fenster')
  assert.ok(log.every((m) => !m.includes('Sprachmodell') && !m.includes('Prompt')), 'das Log nennt nur den Grund, nicht den Text')
})

test('Nacht-Werkzeuge: Schatten kann sich nicht selbst waehlen (enum ohne eigenen Namen)', () => {
  const t = werkzeuge('nacht', SCHATTEN, ['Mira', 'Nora'])[0]
  assert.ok(!t.input_schema.properties.ziel.enum.includes('Lea'))
})

test('Claude-Gehirn: echte Nacht-Antwort wird zu Platz und Ziel; Untersuchen braucht keinen API-Aufruf', async () => {
  let aufrufe = 0
  const anfrage = async () => { aufrufe++; return { werkzeug: { name: 'pruefen', eingabe: { platz: 'Fenster', ziel: 'Mira' } } } }
  const g = claudeGehirn(ladeFigur('Nora'), SCHLUESSEL, { anfrage, mitspieler: NAMEN, zufall: zufall(9) })
  assert.deepEqual(await g.nacht([], ['Nora', 'Mira', 'Lea'], { orte: P.ORT_NAMEN }), { platz: 'Fenster', ziel: 'Mira', verwischen: false })
  const sicht = [{ art: 'fund', nacht: 1, text: 'Kreidestaub an der Tafel, als wäre jemand nur durchgegangen.' }]
  const ergebnisse = new Set()
  for (let i = 0; i < 40; i++) { const u = g.untersuchen(sicht, NAMEN, { orte: [...P.ORT_NAMEN, 'Klassenbuch'] }); if (u) ergebnisse.add(u.ort) }
  assert.ok(ergebnisse.has('Tafel'), 'folgt dem Fund'); assert.ok(ergebnisse.size >= 2)
  const belegt = [...sicht, { art: 'untersucht', nacht: 1, von: 'Sam', ort: 'Tafel' }]
  for (let i = 0; i < 40; i++) { const u = g.untersuchen(belegt, NAMEN, { orte: [...P.ORT_NAMEN, 'Klassenbuch'] }); if (u) assert.notEqual(u.ort, 'Tafel', 'schaut nicht dort nach, wo heute schon jemand war') }
  assert.equal(aufrufe, 1)
})

const sprich = (text) => ({ werkzeug: { name: 'sprechen', eingabe: { text, an: null } } })

test('Waechter: pruefeSprechen kuerzt, erkennt Meta-Woerter und Wiederholung', () => {
  assert.deepEqual(pruefeSprechen('Eins. Zwei! Drei? Vier.', {}), { ok: true, text: 'Eins. Zwei!' })
  assert.equal(pruefeSprechen('Als KI-Modell kann ich das nicht.', {}).ok, false)
  assert.equal(pruefeSprechen('Das ist ein Prompt.', {}).ok, false)
  assert.equal(pruefeSprechen('Ich mag Kino.', {}).ok, true, 'KI nur als ganzes Wort')
  assert.equal(pruefeSprechen('Wer war da?', { eigeneLetzte: 'Wer war da?' }).ok, false)
  assert.deepEqual(pruefeSprechen('Wer war da?', { eigeneLetzte: 'Anders.' }), { ok: true, text: 'Wer war da?' })
})

test('Claude-Gehirn: Rollenbruch -> eine Nachfrage mit Zusatz, bei erneutem Verstoss Schweigen', async () => {
  const log = []
  const { aufrufe, anfrage } = fakeAnfrage([sprich('Als KI-Modell habe ich keine Meinung.'), sprich('Ich bin ein Sprachmodell.')])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, zufall: zufall(1), log: (m) => log.push(m) })
  assert.deepEqual(await g.diskussion([], NAMEN), { art: 'schweigt' })
  assert.equal(aufrufe.length, 2)
  assert.ok(!aufrufe[0].nachricht.includes('Bleib in der Rolle'))
  assert.ok(aufrufe[1].nachricht.includes('Bleib in der Rolle, höchstens zwei Sätze, nichts wiederholen'))
  assert.ok(log.length >= 1)
  // Zweiter Versuch ok: dessen Text zaehlt
  const f2 = fakeAnfrage([sprich('Ich bin ein Prompt.'), sprich('Wer stand am Fenster?')])
  const g2 = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage: f2.anfrage, mitspieler: NAMEN, zufall: zufall(1) })
  assert.equal((await g2.diskussion([], NAMEN)).text, 'Wer stand am Fenster?')
})

test('Claude-Gehirn: vier Saetze werden auf zwei gekuerzt, normale Antwort kostet einen Aufruf', async () => {
  const { aufrufe, anfrage } = fakeAnfrage([sprich('Eins. Zwei. Drei. Vier.'), sprich('Ich war am Fenster.')])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, zufall: zufall(1) })
  assert.equal((await g.diskussion([], NAMEN)).text, 'Eins. Zwei.')
  assert.equal(aufrufe.length, 1)
  assert.equal((await g.diskussion([], NAMEN)).text, 'Ich war am Fenster.')
  assert.equal(aufrufe.length, 2)
})

test('Claude-Gehirn: woertliche Wiederholung der eigenen letzten Aeusserung wird erkannt', async () => {
  const { aufrufe, anfrage } = fakeAnfrage([sprich('Das war Tarik.'), sprich('Das war Tarik.'), sprich('Ich bleibe dabei, Tarik.')])
  const g = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage, mitspieler: NAMEN, zufall: zufall(1) })
  assert.equal((await g.diskussion([], NAMEN)).text, 'Das war Tarik.')
  assert.equal((await g.diskussion([], NAMEN)).text, 'Ich bleibe dabei, Tarik.')
  assert.equal(aufrufe.length, 3)
  const sicht = [{ art: 'sagt', von: 'Lea', text: 'Nochmal.' }]
  const f2 = fakeAnfrage([sprich('Nochmal.'), sprich('Nochmal.')])
  const g2 = claudeGehirn(ladeFigur('Lea'), SCHUELER, { anfrage: f2.anfrage, mitspieler: NAMEN, zufall: zufall(1) })
  assert.deepEqual(await g2.diskussion(sicht, NAMEN), { art: 'schweigt' })
})
