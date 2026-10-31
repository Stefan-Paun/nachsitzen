// Ton ohne Dateien: alles aus WebAudio. Wind als gefiltertes Rauschen, ein paar Klavier-Toene
// fuer Ereignisse, ein Klicken fuer die Lampe. Startet erst nach einem Klick (Browser-Regel).

export function tonAnlage() {
  let ctx = null, wind = null, lautstaerke = null, an = false

  function start() {
    if (ctx) return
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    lautstaerke = ctx.createGain(); lautstaerke.gain.value = 0.9; lautstaerke.connect(ctx.destination)
    // Wind: weisses Rauschen -> Bandpass, dessen Frequenz langsam wandert
    const puffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const d = puffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const quelle = ctx.createBufferSource(); quelle.buffer = puffer; quelle.loop = true
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.7
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07
    const lfoTiefe = ctx.createGain(); lfoTiefe.gain.value = 250; lfo.connect(lfoTiefe); lfoTiefe.connect(filter.frequency)
    const windGain = ctx.createGain(); windGain.gain.value = 0
    quelle.connect(filter); filter.connect(windGain); windGain.connect(lautstaerke)
    quelle.start(); lfo.start()
    wind = windGain
  }

  // Ein Klavier-aehnlicher Ton: Dreieck + leiser Sinus, schnell abklingend
  function note(freq, t0, dauer = 1.6, laut = 0.18) {
    for (const [typ, k] of [['triangle', 1], ['sine', 0.5]]) {
      const o = ctx.createOscillator(); o.type = typ; o.frequency.value = freq
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(laut * k, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dauer)
      o.connect(g); g.connect(lautstaerke); o.start(t0); o.stop(t0 + dauer + 0.05)
    }
  }
  function klick(t0, laut = 0.25) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 180
    const g = ctx.createGain(); g.gain.setValueAtTime(laut, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06)
    o.connect(g); g.connect(lautstaerke); o.start(t0); o.stop(t0 + 0.08)
  }

  return {
    get an() { return an },
    einschalten() { start(); if (ctx.state === 'suspended') ctx.resume(); an = true; this.wind(0.05) },
    ausschalten() { an = false; if (wind) wind.gain.setTargetAtTime(0, ctx.currentTime, 0.3) },
    wind(pegel) { if (!an || !wind) return; wind.gain.setTargetAtTime(pegel, ctx.currentTime, 1.5) },
    // art: nacht | morgen | verschwunden | eingesperrt | ende-schueler | ende-schatten | schreck | stimme
    klang(art) {
      if (!an || !ctx) return
      const t = ctx.currentTime + 0.02
      switch (art) {
        case 'nacht': klick(t); this.wind(0.16); note(110, t + 0.15, 2.5, 0.08); break
        case 'morgen': this.wind(0.05); note(261.6, t, 1.2, 0.1); note(329.6, t + 0.25, 1.4, 0.08); break
        case 'verschwunden': note(196, t, 2, 0.16); note(185, t + 0.5, 2.4, 0.14); note(98, t + 1.0, 3, 0.12); break
        case 'eingesperrt': klick(t, 0.35); klick(t + 0.12, 0.3); note(130.8, t + 0.2, 2, 0.12); break
        case 'ende-schueler': [261.6, 329.6, 392, 523.3].forEach((f, i) => note(f, t + i * 0.12, 2.5, 0.12)); this.wind(0.02); break
        case 'ende-schatten': [196, 185, 174.6, 92.5].forEach((f, i) => note(f, t + i * 0.3, 3, 0.12)); this.wind(0.22); break
        case 'schreck': note(466.2, t, 0.5, 0.09); note(493.9, t + 0.02, 0.5, 0.09); break
        case 'stimme': note(1046.5, t, 0.12, 0.03); break
      }
    },
  }
}
