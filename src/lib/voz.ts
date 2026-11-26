// Lógica de voz, pura (sin DOM): detectar que te llaman ("che nooby") e interpretar lo que pedís.
// El APK solo pasa lo que escucha como texto; lo demás se decide acá, así se ajusta sin reinstalar el celu.

/** Minúsculas, sin tildes ni signos, espacios simples. "¿Qué Hora es?" → "que hora es" */
export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function distancia(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[m][n]
}

// El reconocedor en español no conoce "nooby": la escribe como suena. Estas son las que se aceptan.
// Si en la práctica entiende otra cosa, se agrega acá (el celu guarda lo último que oyó en window.__noobyDebug).
const SUENA_COMO_NOOBY = ['nubi', 'nuvi', 'nuby', 'nobi', 'nuvy', 'nubbi', 'noobi', 'nubis', 'nuvis']
// Después de "che" se acepta además lo que suele salir cuando lo entiende mal.
const PARECIDAS_TRAS_CHE = ['nube', 'nubes', 'nuevo', 'nuevi', 'luvi', 'lubi', 'novi', 'nuvia', 'nubia', 'nuvil', 'nuby', 'nobel']
const LLAMADORES = ['che', 'hey', 'ey', 'ok', 'hola']

export interface Llamado {
  llamado: boolean
  /** Lo que dijiste después de "che nooby" (ya normalizado). */
  resto: string
}

/**
 * ¿Dijo "che nooby" (o parecido)? Solo se acepta una palabra suelta si es casi exacta, para no despertar con "nube".
 *
 * Con `gramatica` (el APK escuchando con la gramática cerrada "che nube / nuevo…") el reconocedor ya filtró todo lo demás,
 * así que "nube" o "nubes" solas también cuentan: es lo más parecido a "nooby" que conoce el modelo.
 */
export function detectarLlamado(
  texto: string,
  opciones: { gramatica?: boolean; /** Frases que el usuario entrenó con su voz (como las entiende el reconocedor). */ variantes?: string[] } = {},
): Llamado {
  // "[unk]" (lo que el reconocedor no pudo clasificar) se ignora.
  const t = normalizar(texto)
    .split(' ')
    .filter((w) => w && w !== 'unk')

  // 1) Lo entrenado con tu voz manda: si el texto contiene una de tus variantes (palabras enteras), te están llamando.
  const relleno = ' ' + t.join(' ') + ' '
  for (const v of opciones.variantes ?? []) {
    const vn = normalizar(v)
    if (!vn) continue
    const i = relleno.indexOf(' ' + vn + ' ')
    if (i >= 0) return { llamado: true, resto: relleno.slice(i + vn.length + 2).trim() }
  }

  // 2) Si no, las formas conocidas de "che nooby".
  for (let i = 0; i < t.length; i++) {
    const w = t[i]
    const exacta = SUENA_COMO_NOOBY.includes(w) || (opciones.gramatica === true && (w === 'nube' || w === 'nubes'))
    const tras = i > 0 && LLAMADORES.includes(t[i - 1])
    const parecida =
      tras && (SUENA_COMO_NOOBY.some((o) => distancia(w, o) <= 1) || PARECIDAS_TRAS_CHE.includes(w))
    if (exacta || parecida) return { llamado: true, resto: t.slice(i + 1).join(' ') }
  }
  return { llamado: false, resto: '' }
}

export type Orden = 'tiempoSentado' | 'clima' | 'hora' | 'levante' | 'agua' | 'chau' | 'ayuda'

/** Qué te pidió. null = no se entendió. El orden importa: "cuánto tiempo llevo sentado" no es el clima. */
export function interpretar(texto: string): Orden | null {
  const t = normalizar(texto)
  if (!t) return null
  if (/(cuanto|hace cuanto|cuantos minutos).*(sentad|llevo)|\bsentad/.test(t)) return 'tiempoSentado'
  if (/\b(clima|temperatura|llover|lluvia|llueve|llovera|frio|calor|pronostico)\b|\bel tiempo\b/.test(t)) return 'clima'
  if (/\bque hora\b|\bla hora\b|\bhora es\b/.test(t)) return 'hora'
  if (/\blevant|\bdescans|\bparado\b/.test(t)) return 'levante'
  if (/\bagua\b|\btome\b|\bbebi\b/.test(t)) return 'agua'
  if (/\b(gracias|chau|nada|listo|basta|callate|silencio|ya esta)\b/.test(t)) return 'chau'
  if (/\bayuda\b|\bque sabes\b|\bque podes\b|\bque haces\b/.test(t)) return 'ayuda'
  return null
}
