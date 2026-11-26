// Charla libre con una IA (Groq, API compatible con OpenAI) y herramientas.
// Vive en el servidor de la PC: la clave nunca llega al celu. Este módulo no toca el disco ni la red por su cuenta:
// recibe `fetchFn` y `ejecutar` (las herramientas) para poder probarlo sin internet.

export const MODELO_POR_DEFECTO = 'llama-3.3-70b-versatile'
export const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_VUELTAS = 4
const MAX_MENSAJES = 12
const MAX_TEXTO = 500

/** Descripciones del código WMO de Open-Meteo, para que la IA no tenga que adivinar. */
const WMO = {
  0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla', 51: 'llovizna', 53: 'llovizna', 55: 'llovizna fuerte',
  61: 'lluvia leve', 63: 'lluvia', 65: 'lluvia fuerte', 71: 'nieve leve', 73: 'nieve', 75: 'nieve fuerte',
  80: 'chubascos', 81: 'chubascos', 82: 'chubascos fuertes', 95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo',
}
export const describirCodigo = (c) => WMO[c] ?? 'sin datos'

export const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'poner_temporizador',
      description: 'Pone un temporizador que hace sonar una alarma al terminar.',
      parameters: {
        type: 'object',
        properties: {
          minutos: { type: 'number', description: 'Duración en minutos (puede ser decimal, ej. 0.5).' },
          etiqueta: { type: 'string', description: 'Para qué es (opcional), ej. "los huevos".' },
        },
        required: ['minutos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_recordatorio',
      description: 'Crea un recordatorio que suena a la hora indicada. Usá en_minutos o fecha_hora (una de las dos).',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Qué hay que recordar, ej. "llamar a Juan".' },
          en_minutos: { type: 'number', description: 'Dentro de cuántos minutos.' },
          fecha_hora: { type: 'string', description: 'Momento exacto, hora local, formato "AAAA-MM-DD HH:MM".' },
        },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'ver_agenda', description: 'Lista los temporizadores y recordatorios pendientes.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_agenda',
      description: 'Cancela temporizadores y/o recordatorios pendientes.',
      parameters: {
        type: 'object',
        properties: { cuales: { type: 'string', enum: ['temporizador', 'recordatorio', 'todos'] } },
        required: ['cuales'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'ver_clima', description: 'Clima actual y pronóstico de hoy en la ciudad del usuario.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'ver_impresoras',
      description: 'Estado de las impresoras 3D del taller (último informe que mandó el agente).',
      parameters: { type: 'object', properties: {} },
    },
  },
]

/** Lo que Nooby "sabe" de entrada: quién es, con quién habla y cómo tiene que contestar (se lee en voz alta). */
export function instrucciones({ nombre, ciudad, ahora, sentadoMin }) {
  const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', hour12: false }).format(ahora)
  return [
    `Sos Nooby, el asistente con cara de ${nombre}, que vive en un celu viejo sobre su escritorio y le habla en voz alta. Hablás en español rioplatense, de vos, con calidez y algo de humor, como una persona.`,
    `Hoy es ${fecha} (hora de Argentina). Vive en ${ciudad}.`,
    sentadoMin > 0 ? `${nombre} lleva ${sentadoMin} minutos sentado.` : '',
    'REGLAS: tus respuestas se leen con un parlante, así que contestá en una o dos frases cortas, sin listas, sin markdown, sin emojis ni símbolos. Escribí los números como se dicen ("las cinco y media", "veinte grados").',
    'Para temporizadores, recordatorios, clima e impresoras usá SIEMPRE las herramientas; nunca digas que hiciste algo sin haberla llamado ni inventes datos del clima o de las impresoras. Para fechas calculá desde la fecha de hoy.',
    'Si te piden algo que no podés hacer (por ejemplo prender luces o buscar en internet), decilo con simpatía y ofrecé lo que sí hacés. No inventes. Si no entendiste, pedí que lo repita.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Historial que llega del celu: solo { rol: 'yo' | 'nooby', texto }, recortado. Queda el último mensaje del usuario al final. */
export function limpiarMensajes(v) {
  const out = []
  for (const m of Array.isArray(v) ? v.slice(-MAX_MENSAJES) : []) {
    if (typeof m !== 'object' || m === null || (m.rol !== 'yo' && m.rol !== 'nooby') || typeof m.texto !== 'string') continue
    const texto = m.texto.trim().slice(0, MAX_TEXTO)
    if (texto) out.push({ role: m.rol === 'yo' ? 'user' : 'assistant', content: texto })
  }
  while (out.length > 0 && out[0].role !== 'user') out.shift()
  return out.length > 0 && out[out.length - 1].role === 'user' ? out : []
}

/** Los textos que ve el usuario por cada tipo de falla (el celu los dice en voz alta). */
export const ERRORES = {
  sin_clave: 'Todavía no tengo cargada la clave de la inteligencia. Se pone en el panel.',
  clave: 'La clave de la inteligencia no anda. Revisala en el panel.',
  cupo: 'Hablé demasiado por ahora y me quedé sin cupo. Probá en un ratito.',
  red: 'No pude conectarme a internet para pensar eso.',
  ia: 'No pude pensar eso ahora.',
}

export class ErrorIA extends Error {
  constructor(tipo, detalle = '') {
    super(ERRORES[tipo] ?? ERRORES.ia)
    this.tipo = tipo
    /** Qué dijo la API (para el log y el panel; no se dice en voz alta). */
    this.detalle = detalle
  }
}

/** Una vuelta de la API. Traduce los códigos HTTP a tipos de error propios. */
async function pedir({ fetchFn, clave, modelo, mensajes, herramientas = true }) {
  let r
  try {
    r = await fetchFn(process.env.NOOBY_IA_URL || URL_GROQ, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        ...(herramientas ? { tools: HERRAMIENTAS, tool_choice: 'auto' } : {}),
        temperature: 0.6,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ErrorIA('red', 'sin conexión con la API')
  }
  if (r.status === 401 || r.status === 403) throw new ErrorIA('clave')
  if (r.status === 429) throw new ErrorIA('cupo')
  if (!r.ok) {
    let det = ''
    try {
      const j = JSON.parse(await r.text())
      det = String(j?.error?.message ?? j?.error?.code ?? '')
    } catch {
      /* sin cuerpo legible */
    }
    throw new ErrorIA('ia', `HTTP ${r.status} ${det}`.trim().slice(0, 300))
  }
  try {
    return (await r.json()).choices?.[0]?.message ?? null
  } catch {
    throw new ErrorIA('ia')
  }
}

/**
 * Charla con herramientas: la IA puede pedir ejecutar cosas (poner un temporizador, ver el clima…) y se le devuelve el resultado
 * hasta que contesta con texto. `ejecutar(nombre, args)` devuelve un objeto simple. Devuelve { texto }.
 */
export async function charlar({ clave, modelo, historial, contexto, ejecutar, fetchFn = fetch }) {
  if (!clave) throw new ErrorIA('sin_clave')
  const msgs = [{ role: 'system', content: instrucciones(contexto) }, ...historial]
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const base = { fetchFn, clave, modelo: modelo || MODELO_POR_DEFECTO, mensajes: msgs }
    let m
    try {
      m = await pedir(base)
    } catch (e) {
      // Algunos modelos fallan al armar una llamada a herramienta (HTTP 400): ese turno se contesta sin herramientas.
      if (e instanceof ErrorIA && e.tipo === 'ia' && /HTTP 400/.test(e.detalle)) m = await pedir({ ...base, herramientas: false })
      else throw e
    }
    if (!m) throw new ErrorIA('ia')
    const llamadas = Array.isArray(m.tool_calls) ? m.tool_calls : []
    if (llamadas.length === 0) {
      const texto = limpiarRespuesta(m.content)
      if (!texto) throw new ErrorIA('ia')
      return { texto }
    }
    msgs.push({ role: 'assistant', content: m.content ?? '', tool_calls: llamadas })
    for (const l of llamadas) {
      let resultado
      try {
        const args = l.function?.arguments ? JSON.parse(l.function.arguments) : {}
        resultado = await ejecutar(String(l.function?.name), args && typeof args === 'object' ? args : {})
      } catch (e) {
        resultado = { error: e instanceof Error ? e.message : 'falló' }
      }
      msgs.push({ role: 'tool', tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 2000) })
    }
  }
  throw new ErrorIA('ia')
}

/** Saca lo que no se puede leer en voz alta: markdown, emojis, viñetas, espacios de más. */
export function limpiarRespuesta(t) {
  return String(t ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600)
}
