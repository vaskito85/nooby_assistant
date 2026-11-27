// Charla libre con una IA (Groq, API compatible con OpenAI) y herramientas.
// Vive en el servidor de la PC: la clave nunca llega al celu. Este módulo no toca el disco ni la red por su cuenta:
// recibe `fetchFn` y `ejecutar` (las herramientas) para poder probarlo sin internet.

export const MODELO_POR_DEFECTO = 'openai/gpt-oss-120b'
/** Si el modelo elegido ya no existe (Groq los va retirando), se prueban estos en orden. */
export const MODELOS_ALTERNATIVOS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']
/** Modelos que Groq ya dio de baja: si quedaron guardados se reemplazan solos. */
export const MODELOS_RETIRADOS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
export const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_VUELTAS = 6
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
    function: {
      name: 'leer_bitacora',
      description:
        'Lee la bitácora: lo que se habló con Nooby y las notas guardadas, de un día o de un rango de días (máximo 14). Usala para "qué hablamos ayer", "resumime la semana", "en qué quedamos".',
      parameters: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Primer día, formato AAAA-MM-DD.' },
          hasta: { type: 'string', description: 'Último día, AAAA-MM-DD (opcional; si falta es el mismo día).' },
        },
        required: ['desde'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_bitacora',
      description: 'Busca una palabra o frase en toda la bitácora ("cuándo hablamos de la H2C").',
      parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'anotar_en_bitacora',
      description: 'Guarda una nota o idea en la bitácora de hoy, cuando te piden "anotá", "guardá esto" o "dejá asentado".',
      parameters: { type: 'object', properties: { texto: { type: 'string', description: 'La nota, clara y completa.' } }, required: ['texto'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordar_dato',
      description: 'Guarda un dato para recordarlo siempre en futuras charlas ("acordate de que mi hermano se llama Pablo").',
      parameters: { type: 'object', properties: { texto: { type: 'string', description: 'El dato, como frase completa.' } }, required: ['texto'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'olvidar_dato',
      description: 'Borra de la memoria los datos que contengan ese texto ("olvidate de lo de mi hermano").',
      parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
    },
  },
  {
    type: 'function',
    function: { name: 'ver_clima', description: 'Clima actual y pronóstico de hoy en la ciudad del usuario.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'ver_uso',
      description: 'Cuánto cupo de inteligencia artificial se usó hoy (pedidos, tokens, minutos de audio) y si Groq avisó que se acabó. Para "cuántos tokens llevo" o "me quedé sin cupo".',
      parameters: { type: 'object', properties: {} },
    },
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
export function instrucciones({ nombre, ciudad, ahora, sentadoMin, memoria = [] }) {
  const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', hour12: false }).format(ahora)
  return [
    `Sos Nooby, el asistente con cara de ${nombre}, que vive en un celu viejo sobre su escritorio y le habla en voz alta. Hablás en español rioplatense, de vos, con calidez y algo de humor, como una persona.`,
    `Hoy es ${fecha} (hora de Argentina). Vive en ${ciudad}.`,
    sentadoMin > 0 ? `${nombre} lleva ${sentadoMin} minutos sentado.` : '',
    memoria.length > 0 ? `Cosas que ${nombre} te pidió recordar:\n${memoria.map((m) => `- ${m}`).join('\n')}` : '',
    'REGLAS: tus respuestas se leen con un parlante, así que contestá en una o dos frases cortas (menos de 30 palabras, salvo que te pidan un resumen o una explicación), sin repetir lo que dijo la persona, sin listas, sin markdown, sin emojis ni símbolos. Escribí los números como se dicen ("las cinco y media", "veinte grados").',
    'Para temporizadores, recordatorios, clima e impresoras usá SIEMPRE las herramientas; nunca digas que hiciste algo sin haberla llamado ni inventes datos del clima o de las impresoras. Para fechas calculá desde la fecha de hoy.',
    `Todo lo que hablan queda guardado en una bitácora (la ve ${nombre} en el panel): podés leerla con las herramientas para contestar "qué hablamos ayer" o "resumime la semana". Conversá de forma natural, como una persona: respondé a lo que dijo, hacé alguna pregunta de vuelta cuando venga bien, y acordate de lo que se habló antes.`,
    'Respondé directamente con lo que vas a decir, en español: nunca escribas tu razonamiento ni expliques cómo vas a contestar.',
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
  constructor(tipo, detalle = '', headers = null) {
    super(ERRORES[tipo] ?? ERRORES.ia)
    this.tipo = tipo
    this.headers = headers
    /** Qué dijo la API (para el log y el panel; no se dice en voz alta). */
    this.detalle = detalle
  }
}

/** Una vuelta de la API. Traduce los códigos HTTP a tipos de error propios. */
async function pedir({ fetchFn, clave, modelo, mensajes, herramientas = true, razonamiento = true, alUso }) {
  let r
  try {
    r = await fetchFn(process.env.NOOBY_IA_URL || URL_GROQ, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        ...(herramientas ? { tools: HERRAMIENTAS, tool_choice: 'auto' } : {}),
        // Los modelos "que razonan" (gpt-oss) piensan antes de contestar: poco esfuerzo y sin devolver ese pensamiento.
        ...(razonamiento && /gpt-oss/.test(modelo) ? { reasoning_effort: 'low', include_reasoning: false } : {}),
        temperature: 0.6,
        max_tokens: 1024, // el razonamiento también gasta de acá: si es muy poco la respuesta sale vacía
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ErrorIA('red', 'sin conexión con la API')
  }
  if (r.status === 401 || r.status === 403) throw new ErrorIA('clave')
  if (r.status === 429) throw new ErrorIA('cupo', await detalleError(r), r.headers)
  if (!r.ok) {
    throw new ErrorIA('ia', `HTTP ${r.status} ${await detalleError(r)}`.trim().slice(0, 300))
  }
  try {
    const j = await r.json()
    alUso?.({ tipo: 'chat', modelo, usage: j.usage, headers: r.headers })
    return j.choices?.[0]?.message ?? null
  } catch {
    throw new ErrorIA('ia')
  }
}

/** Lo que dijo la API al fallar (para el log y el panel). Si es un 429 incluye cuándo se puede volver a probar. */
async function detalleError(r) {
  let det = ''
  try {
    const j = JSON.parse(await r.text())
    det = String(j?.error?.message ?? j?.error?.code ?? '')
  } catch {
    /* sin cuerpo legible */
  }
  const espera = r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : null
  if (r.status === 429 && espera && !/try again in/i.test(det)) det += ` (reintentar en ${espera} s)`
  return det.slice(0, 400)
}

/**
 * Charla con herramientas: la IA puede pedir ejecutar cosas (poner un temporizador, ver el clima…) y se le devuelve el resultado
 * hasta que contesta con texto. `ejecutar(nombre, args)` devuelve un objeto simple. Devuelve { texto }.
 */
export async function charlar({ clave, modelo, historial, contexto, ejecutar, fetchFn = fetch, alUso, alError }) {
  if (!clave) throw new ErrorIA('sin_clave')
  const msgs = [{ role: 'system', content: instrucciones(contexto) }, ...historial]
  let modeloUsado = modelo || MODELO_POR_DEFECTO
  let ultimoError = null
  let huboHerramientas = false
  let avisadoSinHerramienta = false
  const ultimoUsuario = planoIA([...historial].reverse().find((h) => h.role === 'user')?.content)
  let cambio = null // por qué se usó otro modelo: '404' (ya no existe) o 'cupo' (a ese se le acabó el cupo)
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    let m
    for (const candidato of [modelo || MODELO_POR_DEFECTO, ...MODELOS_ALTERNATIVOS.filter((x) => x !== modelo)].filter((x, i, v) => v.indexOf(x) === i)) {
      const base = { fetchFn, clave, modelo: candidato, mensajes: msgs, alUso }
      try {
        const intentos = [{}, { razonamiento: false }, { razonamiento: false, herramientas: false }]
        for (let i = 0; i < intentos.length; i++) {
          try {
            m = await pedir({ ...base, ...intentos[i] })
            break
          } catch (e) {
            // HTTP 400: la API rechazó algo (los parámetros de razonamiento, o una llamada a herramienta mal armada): se prueba más simple.
            if (i < intentos.length - 1 && e instanceof ErrorIA && e.tipo === 'ia' && /HTTP 400/.test(e.detalle)) continue
            throw e
          }
        }
        modeloUsado = candidato
        break
      } catch (e) {
        // 404 = ese modelo no existe (o la cuenta no tiene acceso); 429 = a ese modelo se le acabó el cupo (cada modelo tiene el suyo):
        // en los dos casos se prueba el siguiente.
        const noExiste = e instanceof ErrorIA && e.tipo === 'ia' && /HTTP 404/.test(e.detalle)
        const sinCupo = e instanceof ErrorIA && e.tipo === 'cupo'
        if (noExiste || sinCupo) {
          ultimoError = e
          cambio = noExiste ? '404' : (cambio ?? 'cupo')
          alError?.({ tipo: 'chat', modelo: candidato, kind: e.tipo === 'cupo' ? 'cupo' : 'ia', detalle: e.detalle, headers: e.headers })
          continue
        }
        throw e
      }
    }
    if (m === undefined) throw ultimoError ?? new ErrorIA('ia')
    if (!m) throw new ErrorIA('ia')
    const llamadas = Array.isArray(m.tool_calls) ? m.tool_calls : []
    if (llamadas.length === 0) {
      const texto = limpiarRespuesta(m.content)
      if (!texto) throw new ErrorIA('ia')
      // Dijo "listo" sin hacer nada: se le avisa una vez para que llame la herramienta (o pregunte lo que falta).
      if (!huboHerramientas && !avisadoSinHerramienta && PIDE_ACCION.test(ultimoUsuario) && DICE_HECHO.test(planoIA(texto))) {
        avisadoSinHerramienta = true
        msgs.push({ role: 'assistant', content: texto })
        msgs.push({
          role: 'user',
          content:
            '(Aviso del sistema) No llamaste ninguna herramienta, así que todavía no se hizo nada. Si el pedido era un recordatorio, un temporizador o anotar algo, llamá ahora la herramienta que corresponda; si falta un dato (por ejemplo para cuándo), preguntalo en vez de decir que está listo.',
        })
        continue
      }
      return { texto, modelo: modeloUsado, cambio: modeloUsado === (modelo || MODELO_POR_DEFECTO) ? null : cambio }
    }
    huboHerramientas = true
    msgs.push({ role: 'assistant', content: '', tool_calls: llamadas })
    for (const l of llamadas) {
      let resultado
      try {
        const args = l.function?.arguments ? JSON.parse(l.function.arguments) : {}
        resultado = await ejecutar(String(l.function?.name), args && typeof args === 'object' ? args : {})
      } catch (e) {
        resultado = { error: e instanceof Error ? e.message : 'falló' }
      }
      msgs.push({ role: 'tool', tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 9000) })
    }
  }
  throw new ErrorIA('ia')
}

/** Frases típicas del razonamiento de los modelos que "piensan en voz alta" (en inglés). Si aparecen, esa respuesta no es para leerla. */
const RAZONAMIENTO_FILTRADO =
  /\b(the user (asked|said|wants|is asking)|we need to|we should|let'?s (answer|respond|craft|produce)|should respond|the answer should|okay, we|i need to respond)\b/i

const planoIA = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A veces el modelo dice lo mismo dos veces con otras palabras ("Quedó así: …. Listo, la lista quedó así: …"): se deja la primera. */
export function sinRepetidas(texto) {
  const frases = texto.split(/(?<=[.?!])\s+/)
  const vistas = []
  const salida = []
  for (const f of frases) {
    const w = new Set(planoIA(f).split(/\W+/).filter((p) => p.length > 2))
    const repite = vistas.some((v) => {
      if (w.size < 4 || v.size < 4) return false
      let comunes = 0
      for (const p of w) if (v.has(p)) comunes++
      return comunes / Math.min(w.size, v.size) >= 0.6
    })
    if (!repite) {
      salida.push(f)
      vistas.push(w)
    }
  }
  return salida.join(' ')
}

/** Tope de lo que se dice en voz alta: mientras Nooby habla el micrófono está apagado, así que respuestas largas dejan sin oído. */
export const MAX_VOZ = 320

/** El pedido era una acción (recordatorio, temporizador, nota) y la respuesta dice que está hecho: hay que haber llamado una herramienta. */
const PIDE_ACCION = /\b(record|acord|avis|anot|temporizador|timer|alarma|cronometro)/
const DICE_HECHO = /\b(listo|anote|anotado|anotada|te (lo )?recuerdo|programad[oa]|puse|ya (puse|anote|cree|programe)|quedo (anotado|agendado))\b/

/** Saca lo que no se puede leer en voz alta: markdown, emojis, viñetas, rayas de puntos, espacios de más. Si hay razonamiento filtrado devuelve ''. */
export function limpiarRespuesta(t) {
  let x = String(t ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/(?:\s*[.…]){3,}/g, '.') // "… … …" o "......" no se leen
    .replace(/([.?!])(?=[A-ZÁÉÍÓÚÑ¿¡])/g, '$1 ') // "¿…?Decime" → "¿…? Decime" (el modelo a veces pega dos frases)
    .replace(/\s+/g, ' ')
    .trim()
  if (RAZONAMIENTO_FILTRADO.test(x)) return ''
  x = sinRepetidas(x)
  if (x.length > MAX_VOZ) {
    // se corta en el último final de frase que entre; si no hay, en el último espacio
    const corte = x.slice(0, MAX_VOZ)
    const punto = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '))
    x = punto > 80 ? corte.slice(0, punto + 1) : corte.slice(0, corte.lastIndexOf(' ')).trim() + '.'
  }
  return x
}

// ---------- oído: transcripción con Whisper (Groq) ----------
// El celu manda el audio crudo de cada frase (PCM 16 kHz, 16 bits, mono). Se arma un WAV y se transcribe con Whisper, que entiende
// mucho mejor que el reconocedor chico del celu. La palabra de despertar sigue siendo del celu (sin internet).
export const URL_STT = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const MODELO_STT = 'whisper-large-v3-turbo'
export const FRECUENCIA_PCM = 16000
const MIN_PCM_BYTES = FRECUENCIA_PCM * 2 * 0.4 // menos de 0,4 s no es una frase
const MAX_PCM_BYTES = FRECUENCIA_PCM * 2 * 40

/** Encabezado WAV (44 bytes) + audio PCM 16 bits mono. */
export function armarWav(pcm, frecuencia = FRECUENCIA_PCM) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(frecuencia, 24)
  h.writeUInt32LE(frecuencia * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/**
 * Sube el volumen del audio si quedó bajito (el micrófono del celu graba flojo cuando estás lejos): lleva el pico a ~80 % del máximo,
 * con un tope de ganancia (x8) para no inflar el ruido. Devuelve un buffer nuevo; si ya suena fuerte, el mismo.
 */
export function normalizarPcm(pcm, objetivo = 0.8, gananciaMax = 8) {
  let pico = 0
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const v = Math.abs(pcm.readInt16LE(i))
    if (v > pico) pico = v
  }
  if (pico < 200) return pcm // silencio: no se infla
  const g = Math.min(gananciaMax, (objetivo * 32767) / pico)
  if (g <= 1.05) return pcm
  const out = Buffer.alloc(pcm.length)
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * g))), i)
  }
  return out
}

/** Une los trozos (base64) que mandó el celu. null si no sirven (vacío, muy corto o demasiado largo). */
export function juntarPcm(trozos) {
  if (!Array.isArray(trozos) || trozos.length === 0 || trozos.length > 12) return null
  const partes = []
  let total = 0
  for (const t of trozos) {
    if (typeof t !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(t)) return null
    const b = Buffer.from(t, 'base64')
    total += b.length
    if (total > MAX_PCM_BYTES) return null
    partes.push(b.subarray(0, b.length - (b.length % 2)))
  }
  const pcm = Buffer.concat(partes)
  return pcm.length >= MIN_PCM_BYTES ? pcm : null
}

/** Whisper inventa frases típicas cuando hay silencio o ruido: se descartan. */
const ALUCINACIONES = /(amara\.org|subt[ií]tulos|subtitulad|suscr[ií]b|gracias por ver|thanks for watching|no olvides suscribirte|hasta la pr[oó]xima|chau chau)/i

/** Del JSON verbose de Whisper saca el texto, sin los tramos que probablemente son silencio. */
export function limpiarTranscripcion(j) {
  const segs = Array.isArray(j?.segments) ? j.segments : null
  let texto
  if (segs && segs.length > 0) {
    texto = segs
      .filter((s) => !(typeof s.no_speech_prob === 'number' && s.no_speech_prob > 0.6 && typeof s.avg_logprob === 'number' && s.avg_logprob < -0.7))
      .map((s) => String(s.text ?? ''))
      .join(' ')
  } else texto = String(j?.text ?? '')
  texto = texto.replace(/\s+/g, ' ').trim()
  if (texto.length < 60 && ALUCINACIONES.test(texto)) return ''
  return texto.slice(0, 600)
}

export async function transcribir({ clave, pcm, modelo = MODELO_STT, fetchFn = fetch, alUso }) {
  if (!clave) throw new ErrorIA('sin_clave')
  const f = new FormData()
  f.append('file', new Blob([armarWav(normalizarPcm(pcm))], { type: 'audio/wav' }), 'frase.wav')
  f.append('model', modelo)
  f.append('language', 'es')
  f.append('response_format', 'verbose_json')
  f.append('temperature', '0')
  f.append('prompt', 'Conversación en español rioplatense con un asistente llamado Nooby: temporizador, recordatorio, clima, impresoras.')
  let r
  try {
    r = await fetchFn(process.env.NOOBY_STT_URL || URL_STT, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}` },
      body: f,
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ErrorIA('red', 'sin conexión con la API')
  }
  if (r.status === 401 || r.status === 403) throw new ErrorIA('clave')
  if (r.status === 429) throw new ErrorIA('cupo', await detalleError(r), r.headers)
  if (!r.ok) throw new ErrorIA('ia', `HTTP ${r.status} ${await detalleError(r)}`.trim().slice(0, 300))
  try {
    const j = await r.json()
    alUso?.({ tipo: 'stt', modelo, segundos: pcm.length / (FRECUENCIA_PCM * 2), headers: r.headers })
    return limpiarTranscripcion(j)
  } catch {
    throw new ErrorIA('ia')
  }
}
