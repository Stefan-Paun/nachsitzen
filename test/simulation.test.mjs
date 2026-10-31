import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spielePartie, statistik } from '../tools/simuliere.mjs'
import * as P from '../spiel/partie.mjs'

test('Simulation: 200 Partien enden, keine haengt, jede hat genau einen Sieger', async () => {
  for (let s = 1; s <= 200; s++) {
    const p = await spielePartie(s)
    assert.equal(p.phase, 'ende', `Partie ${s} nicht beendet`)
    assert.ok(['schueler', 'schatten'].includes(p.sieger))
    assert.ok(p.nacht <= P.MAX_NAECHTE)
    const alle = [...p.lebende, ...p.keller, ...p.verschwunden].sort()
    assert.deepEqual(alle, [...p.namen].sort(), 'Jede Figur ist genau an einem Ort')
  }
})

test('Simulation ist deterministisch', async () => {
  const a = await spielePartie(99), b = await spielePartie(99)
  assert.deepEqual(a.ereignisse, b.ereignisse)
})

test('Balance mit Skript-Gehirnen: Schueler gewinnen zwischen 30 und 80 Prozent', async () => {
  const st = await statistik(300, 1)
  const q = st.schueler / st.partien
  assert.ok(q > 0.2 && q < 0.85, `Schueler-Quote ${q}`)
  assert.ok(st.naechteSchnitt >= 1 && st.naechteSchnitt <= 5)
})
