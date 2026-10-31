// Deterministischer Zufall (mulberry32): mit demselben Startwert laeuft eine Partie
// immer gleich ab. Tests und Simulation brauchen das, das echte Spiel nimmt Date.now().

export function zufall(startwert = Date.now()) {
  let a = startwert >>> 0
  const naechste = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    zahl: naechste,                                          // 0 <= x < 1
    bis: (n) => Math.floor(naechste() * n),                  // 0 .. n-1
    aus: (liste) => liste[Math.floor(naechste() * liste.length)],
    mischen: (liste) => {                                     // Fisher-Yates, neue Liste
      const l = [...liste]
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(naechste() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]]
      }
      return l
    },
  }
}
