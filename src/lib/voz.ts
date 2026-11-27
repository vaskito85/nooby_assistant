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
  | 'anotarBitacora'
  | 'pausarBitacora'
  | 'retomarBitacora'
  | 'borrarUltimo'
  | 'tiempoSentado'
  | 'impresoras'
  | 'verCamara'
  | 'temporizador'
  | 'recordatorio'
  | 'faltaPara'
  | 'listarAgenda'
  | 'cancelarAgenda'
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

const ANOTAR_BITACORA =
  /\b(anota|anotame|anotar|escribi|escribe|escribime|guarda|guardame|guardar|agrega|agregame|asenta|asentame|deja asentado)\b.{0,30}\b(bitacora|diario)\b/
const RETOMAR_BITACORA =
  /\b(segui|seguir|retoma|retomar|reanuda|reanudar|volve|volver)\b.{0,20}\b(guardando|guardar|anotando|anotar|bitacora)\b|\bya (podes|puedes) (guardar|anotar)\b|\b(sali|salir|saca|sacar|termina|terminar|fin)\b.{0,12}\bmodo privado\b/
const PAUSAR_BITACORA =
  /\b(no|deja de|dejar de|pausa|pausar|frena|para de)\b.{0,25}\b(guardes|guardar|anotes|anotar|grabes|grabar|registres|registrar)\b|\bpausa\w*\b.{0,15}\bbitacora\b|\bmodo privado\b/
const BORRAR_ULTIMO = /\b(borra|borrame|elimina|olvida|olvidate)\b.{0,12}\b(lo ultimo|lo anterior|esto ultimo|lo que (acabo de )?(dije|hable))\b/
const CANCELAR =
  /\b(cancela|cancelar|cancelame|borra|borrar|elimina|eliminar|apaga|apagar|apagame|quita|quitar|deten|detene|detener|anula|anular)\b.*\b(temporizador|temporizadores|timer|recordatorio|recordatorios|alarma|alarmas|aviso|avisos)\b|\bpara (el |la |los |las )?(temporizador|timer|alarma)\b/
const LISTAR =
  /\b(que|cuales|cuantos|cuantas) (recordatorios|temporizadores|alarmas|avisos)\b|\bmis (recordatorios|temporizadores|alarmas)\b|\bcuanto (falta|queda) (para|en) (el|la|mi) (temporizador|timer|alarma)\b|\bcuanto queda\b|\btengo (algun|alguna|un|una|ningun|ninguna)? ?(recordatorio|temporizador|alarma)/
const FALTA_PARA = /\bcuanto falta (para|hasta)\b|\bcuantos dias (faltan|quedan) (para|hasta)\b|\bcuanto queda (para|hasta)\b/
const PIDE_TEMPORIZADOR = /\b(temporizador|timer|cronometro|cuenta regresiva)\b/
const PIDE_RECORDATORIO = /\b(recordame|recuerdame|acordame|agendame|anotame|recordatorio|recordarme)\b/

const VERBOS_VER = /\b(mostra|mostrame|muestra|muestrame|ensena|ensename|dejame ver|quiero ver|veo|ver|foto|fotos|video|camara)\b|\bque se ve\b/
const PALABRAS_IMPRESORA = /\b(impresora|impresoras|pieza|impresion|h2c|a1|neptun\w*|bambu)\b|\ba uno\b|\bhache\b/
const PIDE_ESTADO = /\bestado\b|\bcomo (van|va|esta|estan)\b|\bcuanto falta\b|\bimprimiendo\b/

/** ¿Pide VER una impresora (su foto)? "mostrame la H2C", "foto de la A1". "El estado de las impresoras" no: eso es otro pedido. */
export const pideVerCamara = (t: string) => VERBOS_VER.test(t) && PALABRAS_IMPRESORA.test(t) && !PIDE_ESTADO.test(t)

/** Cuántas palabras tiene lo que dijiste. */
const palabrasDe = (t: string) => t.split(/\s+/).filter(Boolean).length
/** Pedidos con un verbo claro ("poneme un timer…", "recordame…"): aguantan frases largas. */
const MAX_PEDIDO = 14
/** Preguntas y frases sueltas ("qué hora es", "cómo van las impresoras"): solo cuentan si son cortas. Si no, es charla y va a la IA. */
const MAX_CORTA = 7
/** "Gracias", "chau", "listo": solo cuentan solas. */
const MAX_SOCIAL = 3

const PALABRAS_IMPRESORA_ESTADO = /\b(impresora|impresoras|impresion|impresiones)\b/
const PIDE_ESTADO_IMPRESORA =
  /\b(estado|como (va|van|esta|estan|anda|andan)|cuanto (falta|queda)|que (esta|estan|hay)|imprimiendo|termino|terminaron|novedades|informe|reporte)\b/

/**
 * Qué te pidió. null = no se entendió como un pedido (entonces es charla y se la pasamos a la IA).
 * El orden importa: gana la primera que coincide ("cuánto tiempo llevo sentado" no es el clima; "qué hacés" es charla y "qué sabés hacer" es ayuda).
 * Para no tirarte un menú cuando solo estás conversando ("quiero mejorar mis impresiones el año que viene"), los pedidos sueltos solo se
 * reconocen en frases cortas y con la forma de una pregunta o un comando; las frases largas sin un verbo claro van a la IA.
 * Todo lo que se puede decir está en CATALOGO (que además se muestra en el panel y se prueba con tests).
 */
export function interpretar(texto: string): Orden | null {
  const t = normalizar(texto)
  if (!t) return null
  const n = palabrasDe(t)
  const corta = n <= MAX_CORTA

  // ---- pedidos con un verbo claro (aguantan frases largas)
  if (n <= MAX_PEDIDO) {
    // La bitácora va primero: "anotá en la bitácora que estuve sentado" no es "cuánto llevo sentado".
    if (ANOTAR_BITACORA.test(t)) return 'anotarBitacora'
    if (RETOMAR_BITACORA.test(t)) return 'retomarBitacora' // antes que "pausar": "salí del modo privado" también nombra el modo privado
    if (PAUSAR_BITACORA.test(t)) return 'pausarBitacora'
    if (BORRAR_ULTIMO.test(t)) return 'borrarUltimo'
    if (/(cuanto|hace cuanto|cuantos minutos).*(sentad|llevo)/.test(t)) return 'tiempoSentado'
    // La consulta va primero: "cuánto falta para el temporizador" y "pará el temporizador" se escriben igual sin tildes.
    if (LISTAR.test(t)) return 'listarAgenda'
    if (CANCELAR.test(t)) return 'cancelarAgenda'
    if (FALTA_PARA.test(t) && !/\bimpresora|\bimpresion|\bimprimiendo/.test(t) && !PIDE_TEMPORIZADOR.test(t)) return 'faltaPara'
    if (PIDE_TEMPORIZADOR.test(t)) return 'temporizador'
    // "avisame en 15 minutos" es un temporizador; "avisame mañana que tengo turno" es un recordatorio
    if (/\bavisame\b/.test(t) && /\b(minutos?|horas?|segundos?)\b/.test(t) && !/\bque\b/.test(t)) return 'temporizador'
    if (PIDE_RECORDATORIO.test(t) || /\bavisame\b/.test(t)) return 'recordatorio'
    // La hora y la fecha tienen una forma muy específica ("qué hora es"), así que aguantan frases un poco más largas.
    if (/\bque horas? (es|son)\b|\b(decime|dime|deci|dame|tenes) la hora\b|\bhora actual\b/.test(t)) return 'hora'
    if (/\bque (dia|fecha) (es|son|estamos)\b|\ba cuanto estamos\b|\bfecha de hoy\b/.test(t)) return 'fecha'
    if (n <= 10 && /\bclima\b|\btemperatura\b|\bpronostico\b|\b(va a|vaya a) llover\b|\bllueve\b|\bllovera\b/.test(t)) return 'clima'
  }

  // ---- frases cortas: preguntas y comandos sueltos
  if (corta) {
    if (pideVerCamara(t)) return 'verCamara'
    // Las impresoras: hace falta nombrarlas Y preguntar por su estado ("impresiones" a secas es otra cosa: "quiero mejorar mis impresiones").
    if ((PALABRAS_IMPRESORA_ESTADO.test(t) && PIDE_ESTADO_IMPRESORA.test(t)) || /\bimprimiendo\b/.test(t) || (n <= 4 && /\bcuanto falta\b/.test(t))) return 'impresoras'
    if (/\b(frio|calor|lluvia|paraguas|abrigo|campera)\b|\bel tiempo\b/.test(t) && n <= 5) return 'clima'
    if (/\bya (me )?(levante|descanse|pare)\b|\bme levante\b|\bdescanse\b/.test(t)) return 'levante'
    if (/\bagua\b/.test(t)) return 'agua'
    if (/\bestoy cansado\b|\btengo sueno\b|\bestoy agotado\b|\bno doy mas\b/.test(t)) return 'cansado'
    if (/\bchiste\b|\bhace reir\b|\bhaceme reir\b|\balgo gracioso\b/.test(t)) return 'chiste'
  }
  if (n <= 5) {
    if (/\bayuda\b|\bque sabes\b|\bque podes\b|\bcomandos\b|\bcomo funcionas\b/.test(t)) return 'ayuda'
    if (/\bque haces\b|\bque estas haciendo\b|\ben que andas\b|\bque hacias\b|\bque andas haciendo\b/.test(t)) return 'queHaces'
    if (/\bcomo estas\b|\bque tal\b|\bcomo andas\b|\bcomo te va\b/.test(t)) return 'comoEstas'
    if (/\bquien sos\b|\bquien eres\b|\bcomo te llamas\b|\bcual es tu nombre\b/.test(t)) return 'quienSos'
    if (/\bestas ahi\b|\bme escuchas\b|\bme oyes\b|\bestas despierto\b/.test(t)) return 'estasAhi'
  }
  if (n <= 4 && /\brepeti\b|\brepite\b|\bde nuevo\b|\botra vez\b|\bno te escuche\b|\bno entendi\b/.test(t)) return 'repetir'
  // ---- cortesías: solo cuentan solas ("gracias", "chau"); dentro de una frase larga no cierran nada
  if (n <= MAX_SOCIAL) {
    if (/\b(chau|adios|hasta luego|hasta manana|nos vemos|me voy)\b/.test(t)) return 'despedida'
    if (/\b(gracias|listo|basta|callate|silencio|ya esta)\b/.test(t)) return 'chau'
  }
  if (n <= 4 && /\b(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(t)) return 'saludo'
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
  {
    orden: 'anotarBitacora',
    titulo: 'Anotar algo en la bitácora (queda guardado en la PC)',
    ejemplos: ['anotá en la bitácora que terminé el soporte', 'guardá en el diario que hoy imprimí la A1', 'escribí en la bitácora una idea nueva'],
  },
  { orden: 'pausarBitacora', titulo: 'Que no guarde lo que sigue (modo privado)', ejemplos: ['no guardes esto', 'pausá la bitácora', 'modo privado', 'dejá de guardar'] },
  { orden: 'retomarBitacora', titulo: 'Que vuelva a guardar', ejemplos: ['seguí guardando', 'retomá la bitácora', 'ya podés guardar', 'salí del modo privado'] },
  { orden: 'borrarUltimo', titulo: 'Borrar lo último que se guardó', ejemplos: ['borrá lo último', 'borrá lo que dije', 'olvidate de lo anterior'] },
  {
    orden: 'temporizador',
    titulo: 'Poner un temporizador (suena una alarma al terminar)',
    ejemplos: ['poné un temporizador de 10 minutos', 'temporizador de media hora', 'avisame en 15 minutos', 'cuenta regresiva de 5 minutos', 'poneme un timer de cinco minutos para los huevos'],
  },
  {
    orden: 'recordatorio',
    titulo: 'Crear un recordatorio',
    ejemplos: ['recordame llamar a Juan mañana a las nueve', 'creame un recordatorio de comprar pan', 'acordame en 20 minutos de apagar el horno', 'avisame mañana que tengo turno'],
  },
  { orden: 'faltaPara', titulo: 'Cuánto falta para una fecha', ejemplos: ['cuánto falta para Navidad', 'cuántos días faltan para el 15 de marzo', 'cuánto falta para fin de año'] },
  { orden: 'listarAgenda', titulo: 'Qué recordatorios o temporizadores tengo', ejemplos: ['qué recordatorios tengo', 'qué temporizadores hay', 'cuánto falta para el temporizador'] },
  { orden: 'cancelarAgenda', titulo: 'Cancelar un temporizador o recordatorio', ejemplos: ['cancelá el temporizador', 'borrá los recordatorios', 'apagá la alarma'] },
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
  {
    orden: 'verCamara',
    titulo: 'Ver una impresora (foto)',
    ejemplos: ['mostrame la impresora', 'mostrame la H2C', 'foto de la A1', 'quiero ver la cámara de la impresora', 'qué se ve en la impresora'],
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
  return /\b(ok|okey|okay|oka|oke|listo|entendido|gracias|basta|callate|silencio|dale|ya esta|apaga|apagala|apagalo|detene|detenela|detenelo)\b/.test(normalizar(texto))
}

/** La nota de "anotá en la bitácora que terminé el soporte" → "terminé el soporte". '' si no dijo qué anotar. */
export function extraerNota(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  const despues = /\b(?:bit[aá]cora|diario)\b\s*(?:[:,]\s*|que\s+|de que\s+)?(.*)$/i.exec(t)?.[1]?.trim() ?? ''
  if (despues) return despues.replace(/^(?:lo siguiente|esto)\b[:,]?\s*/i, '').trim()
  // "anotá que terminé el soporte en la bitácora"
  const antes = /\b(?:anot[aá]\w*|guard[aá]\w*|escrib[ií]\w*|agreg[aá]\w*|asent[aá]\w*)\s+(?:que\s+)?(.+?)\s+en\s+(?:la|el)\s+(?:bit[aá]cora|diario)\b/i.exec(t)?.[1]
  return (antes ?? '').trim()
}
