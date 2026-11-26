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

export type Orden =
  | 'tiempoSentado'
  | 'impresoras'
  | 'fecha'
  | 'clima'
  | 'hora'
  | 'levante'
  | 'agua'
  | 'ayuda'
  | 'queHaces'
  | 'comoEstas'
  | 'quienSos'
  | 'estasAhi'
  | 'cansado'
  | 'chiste'
  | 'repetir'
  | 'despedida'
  | 'chau'
  | 'saludo'

/**
 * Qué te pidió. null = no se entendió. El orden importa: gana la primera que coincide
 * ("cuánto tiempo llevo sentado" no es el clima; "qué hacés" es charla y "qué sabés hacer" es ayuda).
 * Todo lo que se puede decir está en CATALOGO (que además se muestra en el panel y se prueba con tests).
 */
export function interpretar(texto: string): Orden | null {
  const t = normalizar(texto)
  if (!t) return null
  if (/(cuanto|hace cuanto|cuantos minutos).*(sentad|llevo)|\bsentad/.test(t)) return 'tiempoSentado'
  if (/\bimpresora|\bimpresion|\bimprimiendo|\bcuanto falta\b/.test(t)) return 'impresoras'
  if (/\bque dia\b|\bque fecha\b|\ba cuanto estamos\b|\bfecha de hoy\b|\bdia de hoy\b/.test(t)) return 'fecha'
  if (/\b(clima|temperatura|llover|lluvia|llueve|llovera|frio|calor|pronostico|paraguas|abrigo|campera)\b|\bel tiempo\b/.test(t)) return 'clima'
  if (/\bque horas?\b|\bla hora\b|\bhora es\b/.test(t)) return 'hora'
  if (/\blevant|\bdescans|\bparado\b/.test(t)) return 'levante'
  if (/\bagua\b|\btome\b|\bbebi\b/.test(t)) return 'agua'
  if (/\bayuda\b|\bque sabes\b|\bque podes\b|\bcomandos\b|\bcomo funcionas\b/.test(t)) return 'ayuda'
  if (/\bque haces\b|\bque estas haciendo\b|\ben que andas\b|\bque hacias\b|\bque andas haciendo\b/.test(t)) return 'queHaces'
  if (/\bcomo estas\b|\bque tal\b|\bcomo andas\b|\bcomo te va\b/.test(t)) return 'comoEstas'
  if (/\bquien sos\b|\bquien eres\b|\bcomo te llamas\b|\bcual es tu nombre\b/.test(t)) return 'quienSos'
  if (/\bestas ahi\b|\bme escuchas\b|\bme oyes\b|\bestas despierto\b/.test(t)) return 'estasAhi'
  if (/\bestoy cansado\b|\btengo sueno\b|\bestoy agotado\b|\bno doy mas\b/.test(t)) return 'cansado'
  if (/\bchiste\b|\bhace reir\b|\bhaceme reir\b|\balgo gracioso\b/.test(t)) return 'chiste'
  if (/\brepeti\b|\brepite\b|\bde nuevo\b|\botra vez\b|\bno te escuche\b|\bno entendi\b/.test(t)) return 'repetir'
  if (/\b(chau|adios|hasta luego|hasta manana|nos vemos|me voy)\b/.test(t)) return 'despedida'
  if (/\b(gracias|nada|listo|basta|callate|silencio|ya esta)\b/.test(t)) return 'chau'
  if (/\b(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(t)) return 'saludo'
  return null
}

export interface GrupoFrases {
  orden: Orden
  titulo: string
  /** Frases de ejemplo. Hay un test que comprueba que cada una se entiende como `orden`. */
  ejemplos: string[]
}

/** Todo lo que se le puede decir a Nooby (después de despertarlo con "che nooby"). */
export const CATALOGO: GrupoFrases[] = [
  { orden: 'hora', titulo: 'La hora', ejemplos: ['qué hora es', 'decime la hora', 'qué horas son'] },
  { orden: 'fecha', titulo: 'La fecha', ejemplos: ['qué día es hoy', 'qué fecha es', 'a cuánto estamos'] },
  {
    orden: 'clima',
    titulo: 'El clima',
    ejemplos: ['cómo está el clima', 'qué temperatura hace', 'cómo está el tiempo', 'va a llover', 'tengo que llevar paraguas', 'hace frío'],
  },
  {
    orden: 'impresoras',
    titulo: 'Las impresoras',
    ejemplos: ['dime el estado de las impresoras', 'cómo van las impresoras', 'cuánto falta', 'qué está imprimiendo', 'cómo va la impresión'],
  },
  { orden: 'tiempoSentado', titulo: 'Cuánto llevás sentado', ejemplos: ['cuánto tiempo llevo sentado', 'hace cuánto estoy sentado'] },
  { orden: 'levante', titulo: 'Avisarle que descansaste', ejemplos: ['ya me levanté', 'ya descansé'] },
  { orden: 'agua', titulo: 'Avisarle que tomaste agua', ejemplos: ['ya tomé agua', 'tomé un vaso de agua'] },
  { orden: 'queHaces', titulo: 'Qué está haciendo', ejemplos: ['qué estás haciendo', 'qué hacés', 'en qué andás'] },
  { orden: 'comoEstas', titulo: 'Cómo está', ejemplos: ['cómo estás', 'qué tal', 'cómo andás'] },
  { orden: 'quienSos', titulo: 'Quién es', ejemplos: ['quién sos', 'cómo te llamás'] },
  { orden: 'estasAhi', titulo: 'Si está ahí', ejemplos: ['estás ahí', 'me escuchás'] },
  { orden: 'saludo', titulo: 'Saludarlo', ejemplos: ['hola', 'buen día', 'buenas tardes', 'buenas noches'] },
  { orden: 'cansado', titulo: 'Contarle que estás cansado', ejemplos: ['estoy cansado', 'tengo sueño'] },
  { orden: 'chiste', titulo: 'Un chiste', ejemplos: ['contame un chiste', 'hacé reír', 'algo gracioso'] },
  { orden: 'repetir', titulo: 'Que repita lo último', ejemplos: ['repetí', 'de nuevo', 'otra vez', 'no te escuché'] },
  { orden: 'chau', titulo: 'Darle las gracias o callarlo', ejemplos: ['gracias', 'listo', 'ya está', 'basta', 'callate'] },
  { orden: 'despedida', titulo: 'Despedirte', ejemplos: ['chau', 'hasta luego', 'nos vemos', 'me voy'] },
  { orden: 'ayuda', titulo: 'Qué sabe hacer', ejemplos: ['ayuda', 'qué sabés hacer', 'qué podés hacer'] },
]

/** ¿Te están diciendo "OK" / "listo" para cerrar un aviso? (se usa mientras suena la alarma de la impresora) */
export function esConfirmacion(texto: string): boolean {
  return /\b(ok|okey|okay|oka|oke|listo|entendido|gracias|basta|callate|silencio|dale|ya esta)\b/.test(normalizar(texto))
}
