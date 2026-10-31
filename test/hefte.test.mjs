import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hefteSpeicher, eintragBauen, MAX_EINTRAEGE_IM_PROMPT } from '../spiel/hefte.mjs'
import { behauptungAus } from '../spiel/welt.mjs'
import { zufall } from '../spiel/zufall.mjs'
import { claudeGehirn, ladeFigur, systemPrompt } from '../spiel/gehirn.mjs'
import { SCHUELER } from '../spiel/rollen.mjs'
import * as P from '../spiel/partie.mjs'

const NAMEN = ['Mira', 'Jonas', 'Lea', 'Tarik', 'Nora', 'Stefan']
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ns-hefte-'))

test('Heft: schreiben, lesen, Prompt-Text mit letztem Vertrauen; Datei privat, keine Tmp-Reste', () => {
  const h = hefteSpeicher({ ordner: tmp() })
  assert.equal(h.alsText('Nora'), '')
  h.schreiben('Nora', { eintrag: 'Stefan hat gelogen, er war nie am Fenster.', vertrauen: { Stefan: -2, Lea: 1 } })
  h.schreiben('Nora', { eintrag: 'Lea hatte wieder recht.', vertrauen: { Lea: 2 } })
  const t = h.alsText('Nora')
  assert.match(t, /Stefan hat gelogen/); assert.match(t, /Lea hatte wieder recht/)
  assert.match(t, /Stefan: traue ich gar nicht/); assert.match(t, /Lea: vertraue ich/)
  assert.equal(h.lesen('Nora').length, 2); assert.ok(h.lesen('Nora')[0].datum.match(/^\d{4}-\d{2}-\d{2}$/))
  for (let i = 0; i < 10; i++) h.schreiben('Nora', { eintrag: `Nacht ${i}`, vertrauen: {} })
  assert.equal(h.alsText('Nora').split('\n').filter((z) => z.startsWith('- ')).length, MAX_EINTRAEGE_IM_PROMPT)
  assert.deepEqual(Object.keys(h.alle(['Nora', 'Mira'])), ['Nora', 'Mira']); assert.equal(h.alle(['Mira']).Mira.length, 0)
})

test('Heft-Datei: Rechte 0600, Name bereinigt, keine Tmp-Dateien', () => {
  const o = tmp(); const h = hefteSpeicher({ ordner: o })
  h.schreiben('Lea', { eintrag: 'x', vertrauen: {} })
  const dateien = fs.readdirSync(o)
  assert.deepEqual(dateien, ['lea.json'])
  assert.equal(fs.statSync(path.join(o, 'lea.json')).mode & 0o777, 0o600)
})

test('eintragBauen: Werte begrenzt, fremde Namen weg, leerer Text bekommt Ersatz', () => {
  const e = eintragBauen({ eintrag: '  Jonas lügt.  ', vertrauen: [{ name: 'Jonas', wert: -7 }, { name: 'Fremd', wert: 2 }, { name: 'Lea', wert: 1.4 }] }, ['Jonas', 'Lea'])
  assert.deepEqual(e, { eintrag: 'Jonas lügt.', vertrauen: { Jonas: -2, Lea: 1 } })
  assert.match(eintragBauen({}, []).eintrag, /Nacht/)
})

test('behauptungAus erkennt eigene Platzangaben, aber keine Beobachtungen ueber andere', () => {
  assert.equal(behauptungAus('Ich war am Fenster, die ganze Nacht.'), 'Fenster')
  assert.equal(behauptungAus('Nora, ich stand bei der Tür und hab nichts gehört.'), 'Tür')
  assert.equal(behauptungAus('Ehrlich, ich bin an der Tafel gestanden.'), 'Tafel')
  assert.equal(behauptungAus('ich war bei den Pulten'), 'Pulte')
  assert.equal(behauptungAus('Ich hab dich am Fenster gesehen, Tarik.'), null)
  assert.equal(behauptungAus('Jonas war bei der Tür.'), null)
  assert.equal(behauptungAus(''), null)
})

test('Partie: Behauptung landet im Ereignis, Unsinn wird verworfen', () => {
  const p = P.neuePartie(NAMEN, zufall(2))
  P.sprechen(p, 'Mira', 'Ich war am Fenster.', null, 'Fenster')
  P.sprechen(p, 'Lea', 'Egal.', null, 'Dachboden')
  const [a, b] = p.ereignisse.filter((e) => e.art === 'sagt')
  assert.equal(a.behauptet, 'Fenster'); assert.equal(b.behauptet, null)
})

test('Claude-Gehirn: Heft steht im Systemprompt, Behauptung kommt aus dem Werkzeug oder dem Text, heftSchreiben liefert Eintrag', async () => {
  const heft = '- 2026-10-30: Stefan hat mich angelogen.\n\nWem du nach allem traust: Stefan: traue ich gar nicht.'
  const s = systemPrompt(ladeFigur('Nora'), SCHUELER, NAMEN, 'Stefan', heft)
  assert.ok(s.includes('## Dein Heft') && s.includes('Stefan hat mich angelogen'))
  assert.ok(!systemPrompt(ladeFigur('Nora'), SCHUELER, NAMEN, 'Stefan', '').includes('## Dein Heft'))
  const antworten = [
    { werkzeug: { name: 'sprechen', eingabe: { text: 'Ich stand bei der Tür.', an: null, behauptetPlatz: 'Tür' } } },
    { werkzeug: { name: 'sprechen', eingabe: { text: 'Ich war am Fenster, Tarik.', an: 'Tarik', behauptetPlatz: null } } },
    { werkzeug: { name: 'heft_schreiben', eingabe: { eintrag: 'Stefan war der Schatten. Nie wieder glaube ich ihm.', vertrauen: [{ name: 'Stefan', wert: -2 }, { name: 'Lea', wert: 2 }] } } },
    { werkzeug: null, grund: 'refusal' },
  ]
  let letzteAnfrage
  const g = claudeGehirn(ladeFigur('Nora'), SCHUELER, { anfrage: async (req) => { letzteAnfrage = req; return antworten.shift() }, mitspieler: NAMEN, spieler: 'Stefan', zufall: zufall(1), heft })
  assert.ok(g.system.includes('Stefan hat mich angelogen'))
  const a = await g.diskussion([], NAMEN); assert.equal(a.behauptet, 'Tür')
  const b = await g.diskussion([], NAMEN); assert.equal(b.behauptet, 'Fenster', 'Rueckfall: aus dem Text erkannt')
  const z = { sieger: 'schueler', schatten: 'Stefan', verschwunden: ['Mira'], keller: ['Stefan'], uebrig: ['Nora', 'Lea'] }
  const e = await g.heftSchreiben([], z)
  assert.deepEqual(e, { eintrag: 'Stefan war der Schatten. Nie wieder glaube ich ihm.', vertrauen: { Stefan: -2, Lea: 2 } })
  assert.equal(letzteAnfrage.tools[0].name, 'heft_schreiben'); assert.match(letzteAnfrage.nachricht, /Schatten war Stefan/)
  // Strikte Werkzeuge: die API lehnt minimum/maximum ab (400 in Partie 6), erlaubt sind Enums
  const schemaText = JSON.stringify(letzteAnfrage.tools[0].input_schema)
  assert.ok(!/minimum|maximum/.test(schemaText), 'kein minimum/maximum im Schema')
  assert.deepEqual(letzteAnfrage.tools[0].input_schema.properties.vertrauen.items.properties.wert.enum, [-2, -1, 0, 1, 2])
  const f = await g.heftSchreiben([], z)
  assert.match(f.eintrag, /Stefan der Schatten war/); assert.deepEqual(f.vertrauen, {})
})
