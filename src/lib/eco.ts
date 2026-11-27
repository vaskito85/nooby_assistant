import { normalizar } from './voz'

// Si el micrófono vuelve a abrirse antes de que Nooby termine de hablar (o queda eco en la habitación), "oye" su propia voz y la
// mezcla con lo que decís. Acá se sacan de lo oído las frases que son (casi) lo mismo que Nooby acaba de decir.

const palabras = (t: string) => normalizar(t).split(/\s+/).filter(Boolean)
const frases = (t: string) =>
  t
    .split(/(?<=[.?!…])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Qué parte de la frase más corta aparece en la otra (0 a 1). */
function parecido(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const enB = new Set(b)
  const comunes = a.filter((w) => enB.has(w)).length
  return comunes / Math.min(a.length, b.length)
}

/**
 * Devuelve lo que oyó sin las frases que repiten lo que Nooby dijo (`dichas`: sus últimas respuestas). Una frase cuenta como eco si
 * tiene 3 palabras o más y casi todas están en alguna frase de Nooby. Si no queda nada, devuelve ''.
 */
export function quitarEco(oido: string, dichas: string[]): string {
  const ref = dichas.flatMap((d) => frases(d)).map(palabras)
  if (ref.length === 0) return oido.trim()
  const propias = frases(oido).filter((f) => {
    const w = palabras(f)
    if (w.length < 3) return true // frases cortas ("sí", "dale") nunca se toman por eco
    return !ref.some((r) => r.length >= 3 && parecido(w, r) >= 0.75)
  })
  return propias.join(' ').trim()
}
