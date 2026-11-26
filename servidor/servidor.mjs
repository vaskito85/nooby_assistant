// Servidor local de Nooby (PC). Sin dependencias: solo Node.
//  - Sirve la web (dist/) y el panel en http://127.0.0.1:8777
//  - Guarda los ajustes y se los pasa al celu por SSE
//  - Recibe avisos (POST /api/aviso) y los reenvía al celu
//  - Mantiene el `adb reverse` por USB para que el celu llegue a este servidor
//  - Opcional: escucha un tema de ntfy y lo reenvía (para avisos que vienen de otra máquina, ej. la Raspberry)
import { execFile, spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir, networkInterfaces } from 'node:os'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GET as pedirCiudad } from '../api/ciudad.js'
import { GET as pedirClima } from '../api/clima.js'
import { charlar, describirCodigo, ErrorIA, ERRORES, limpiarMensajes, MODELO_POR_DEFECTO, MODELOS_RETIRADOS } from './ia.mjs'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const WEB = join(RAIZ, 'dist')
const CARPETA = process.env.NOOBY_CARPETA || join(homedir(), '.nooby')
const ARCHIVO = join(CARPETA, 'config.json')
const VERSION = '0.2.0'
const PAQUETE = 'com.nooby.asistente'

// ---------- configuración ----------
const porDefecto = {
  config: { sentadoMin: 60, aguaMin: 45, ciudad: 'Bahía Blanca', lat: -38.72, lon: -62.27, voz: true, nombre: 'Ger', fraseLlamado: 'che nooby', llamadas: [] },
  servidor: {
    puerto: 8777,
    /** '127.0.0.1' = solo esta PC. '0.0.0.0' = también la red local (entonces /api/aviso pide token). */
    escuchar: '127.0.0.1',
    token: '',
    adb: 'adb',
    autoabrir: true,
    ntfy: { servidor: 'https://ntfy.sh', tema: '' },
    /** Charla libre con IA (Groq). La clave vive solo acá: nunca se manda al celu ni a /api/config. */
    ia: { clave: '', modelo: MODELO_POR_DEFECTO },
  },
}

function cargar() {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, 'utf8'))
    return {
      config: { ...porDefecto.config, ...g.config },
      servidor: { ...porDefecto.servidor, ...g.servidor, ntfy: { ...porDefecto.servidor.ntfy, ...g.servidor?.ntfy }, ia: { ...porDefecto.servidor.ia, ...g.servidor?.ia } },
    }
  } catch {
    return structuredClone(porDefecto)
  }
}
function guardar() {
  mkdirSync(CARPETA, { recursive: true })
  writeFileSync(ARCHIVO, JSON.stringify(estado, null, 2))
}

const estado = cargar()
// Un modelo que Groq ya retiró y quedó guardado se cambia solo por el actual.
if (MODELOS_RETIRADOS.includes(estado.servidor.ia.modelo)) estado.servidor.ia.modelo = MODELO_POR_DEFECTO
// Variables de entorno: pisan lo guardado, pero nunca se guardan en el archivo.
const PUERTO = Number(process.env.NOOBY_PUERTO) || estado.servidor.puerto
const ADB = process.env.NOOBY_ADB || estado.servidor.adb
if (!existsSync(ARCHIVO)) guardar()

const FRASE_OK = /^[a-záéíóúüñ ]{1,40}$/
/** Variantes entrenadas del llamado: minúsculas, letras y espacios, hasta 5 palabras, máximo 20 sin repetir. */
function validarLlamadas(v) {
  const out = []
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x !== 'string') continue
    const f = x.toLowerCase().replace(/\s+/g, ' ').trim()
    if (FRASE_OK.test(f) && f.split(' ').length <= 5 && !out.includes(f)) out.push(f)
    if (out.length >= 20) break
  }
  return out
}
const validarFrase = (v, def) =>
  typeof v === 'string' && /^[A-Za-záéíóúüñÁÉÍÓÚÜÑ ]{1,40}$/.test(v.trim()) ? v.trim() : def

const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)

/** Valida lo que llega de afuera (el panel): ignora lo raro y limita los rangos. */
function validarConfig(c, actual) {
  if (typeof c !== 'object' || c === null) return actual
  return {
    sentadoMin: num(c.sentadoMin, 1, 600, actual.sentadoMin),
    aguaMin: num(c.aguaMin, 0, 600, actual.aguaMin),
    ciudad: typeof c.ciudad === 'string' && c.ciudad.length <= 80 ? c.ciudad : actual.ciudad,
    lat: num(c.lat, -90, 90, actual.lat),
    lon: num(c.lon, -180, 180, actual.lon),
    voz: typeof c.voz === 'boolean' ? c.voz : actual.voz,
    nombre: typeof c.nombre === 'string' && c.nombre.trim() && c.nombre.length <= 30 ? c.nombre.trim() : actual.nombre,
    fraseLlamado: validarFrase(c.fraseLlamado, actual.fraseLlamado),
    llamadas: Array.isArray(c.llamadas) ? validarLlamadas(c.llamadas) : actual.llamadas,
  }
}

// ---------- celus conectados (SSE) ----------
const clientes = new Set()
function emitir(evento, datos) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`
  for (const res of clientes) res.write(msg)
}

// ---------- adb por USB ----------
const dispositivos = new Map() // serial -> { reverse: bool } (solo los autorizados)
const avisadosEstado = new Set()
function adb(args) {
  return new Promise((resolve) =>
    execFile(ADB, args, { timeout: 8000, windowsHide: true }, (e, so) =>
      resolve({ e, so: String(so ?? '') }),
    ),
  )
}

async function cicloAdb() {
  const { e, so } = await adb(['devices'])
  if (e) {
    if (!cicloAdb.avisado) console.log(`[adb] no pude ejecutar "${ADB}": ${e.message}`)
    cicloAdb.avisado = true
    return
  }
  cicloAdb.avisado = false
  const puerto = PUERTO
  const vistos = new Set()
  for (const linea of so.split(/\r?\n/).slice(1)) {
    const [serial, st] = linea.trim().split(/\s+/)
    if (!serial) continue
    if (st !== 'device') {
      if (!avisadosEstado.has(serial + st)) console.log(`[adb] ${serial}: ${st} (aceptá la depuración USB en el celu)`)
      avisadosEstado.add(serial + st)
      continue
    }
    vistos.add(serial)
    const lista = await adb(['-s', serial, 'reverse', '--list'])
    if (!lista.so.includes(`tcp:${puerto}`)) {
      const r = await adb(['-s', serial, 'reverse', `tcp:${puerto}`, `tcp:${puerto}`])
      console.log(r.e ? `[adb] ${serial}: falló el reverse (${r.e.message})` : `[adb] ${serial}: celu conectado, puerto ${puerto} compartido`)
      if (!r.e && estado.servidor.autoabrir) {
        await adb(['-s', serial, 'shell', 'am', 'start', '-n', `${PAQUETE}/.MainActivity`])
      }
    }
    dispositivos.set(serial, { reverse: true })
  }
  for (const k of [...dispositivos.keys()]) {
    if (!vistos.has(k)) {
      console.log(`[adb] ${k}: celu desconectado`)
      dispositivos.delete(k)
    }
  }
}

// ---------- puente opcional desde ntfy ----------
async function puenteNtfy() {
  const { servidor, tema } = estado.servidor.ntfy
  if (!tema) return
  const base = servidor.replace(/\/+$/, '')
  for (;;) {
    try {
      const r = await fetch(`${base}/${encodeURIComponent(tema)}/json`)
      console.log(`[ntfy] escuchando el tema (${r.status})`)
      let resto = ''
      for await (const trozo of r.body) {
        resto += Buffer.from(trozo).toString('utf8')
        const lineas = resto.split('\n')
        resto = lineas.pop() ?? ''
        for (const l of lineas) {
          try {
            const m = JSON.parse(l)
            if (m.event === 'message' && typeof m.message === 'string') emitir('aviso', { texto: m.message.slice(0, 300) })
          } catch {
            /* línea que no es JSON */
          }
        }
      }
    } catch (e) {
      console.log(`[ntfy] se cortó (${e.message}); reintento en 10 s`)
    }
    await new Promise((r) => setTimeout(r, 10_000))
  }
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.png': 'image/png',
}

function leerCuerpo(req, max = 8192) {
  return new Promise((resolve, reject) => {
    let t = ''
    req.on('data', (c) => {
      t += c
      if (t.length > max) {
        reject(new Error('cuerpo muy grande'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(t))
    req.on('error', reject)
  })
}

// ---------- pedidos de foto ----------
// La cara le pide una foto de una impresora; el agente (otra máquina) consulta GET /api/pedidos, saca la foto y la manda
// por POST /api/foto. Así Nooby nunca tiene que entrar a la red del agente.
const PEDIDO_VIDA_MS = 45_000 // si el agente no responde en este tiempo, el pedido se descarta
const pedidos = new Map() // clave de la impresora -> { id, nombre, clave, hasta }
const esperandoPedidos = new Set() // agentes con una consulta larga abierta

function pedidosVigentes() {
  const ahora = Date.now()
  for (const [k, p] of pedidos) if (p.hasta <= ahora) pedidos.delete(k)
  return [...pedidos.values()].map((p) => ({ id: p.id, impresora: p.nombre, clave: p.clave, restanteMs: p.hasta - ahora }))
}

/** Le avisa de inmediato a los agentes que estaban esperando (consulta larga) que hay un pedido nuevo. */
function despertarEsperando() {
  const lista = pedidosVigentes()
  for (const w of [...esperandoPedidos]) {
    clearTimeout(w.timer)
    esperandoPedidos.delete(w)
    if (!w.res.writableEnded) json(w.res, 200, { pedidos: lista })
  }
}

// ---------- agenda: temporizadores y recordatorios ----------
// Viven acá (en la PC, que está siempre prendida) y no en el celu: así sobreviven si se recarga la página o se reinicia el celu.
// Al llegar la hora se manda el evento "agenda" por SSE y la cara hace sonar la alarma. Si en ese momento no hay ninguna cara
// conectada, queda pendiente y se entrega apenas se conecte una (hasta 24 h después).
const ARCHIVO_AGENDA = join(CARPETA, 'agenda.json')
const AGENDA_MAX = 50
const TIPOS_AGENDA = ['temporizador', 'recordatorio']

function cargarAgenda() {
  try {
    const j = JSON.parse(readFileSync(ARCHIVO_AGENDA, 'utf8'))
    return Array.isArray(j) ? j.filter((i) => i && TIPOS_AGENDA.includes(i.tipo) && Number.isFinite(i.cuando)) : []
  } catch {
    return []
  }
}
let agenda = cargarAgenda()
function guardarAgenda() {
  mkdirSync(CARPETA, { recursive: true })
  writeFileSync(ARCHIVO_AGENDA, JSON.stringify(agenda))
}
const pendientesAgenda = () => agenda.filter((i) => i.estado === 'pendiente')
const publicoAgenda = (i) => ({ id: i.id, tipo: i.tipo, texto: i.texto, cuando: i.cuando, duracionMs: i.duracionMs })

/** Valida lo que manda la cara: tipo, texto corto y un momento futuro (hasta 400 días). null si no sirve. */
function itemAgenda(c, ahora) {
  if (typeof c !== 'object' || c === null || !TIPOS_AGENDA.includes(c.tipo)) return null
  let cuando
  if (typeof c.enMs === 'number' && Number.isFinite(c.enMs)) cuando = ahora + c.enMs
  else if (typeof c.cuando === 'number' && Number.isFinite(c.cuando)) cuando = c.cuando
  else return null
  if (cuando < ahora + 500 || cuando > ahora + 400 * 86_400_000) return null
  return {
    id: randomBytes(6).toString('hex'),
    tipo: c.tipo,
    texto: String(c.texto ?? '').trim().slice(0, 120),
    cuando,
    duracionMs: c.tipo === 'temporizador' && typeof c.enMs === 'number' ? Math.min(Math.round(c.enMs), 7 * 86_400_000) : undefined,
    creado: ahora,
    estado: 'pendiente',
  }
}

/** Una vez por segundo: lo que venció se avisa (o queda pendiente si no hay cara conectada). */
function revisarAgenda() {
  const ahora = Date.now()
  let cambio = false
  for (const it of agenda) {
    if (it.estado !== 'pendiente' || it.cuando > ahora) continue
    if (clientes.size > 0) {
      emitir('agenda', publicoAgenda(it))
      it.estado = 'avisado'
      it.avisado = ahora
      cambio = true
    } else if (ahora - it.cuando > 24 * 3_600_000) {
      it.estado = 'perdido'
      it.avisado = ahora
      cambio = true
    }
  }
  const antes = agenda.length
  agenda = agenda.filter((it) => it.estado === 'pendiente' || ahora - (it.avisado ?? it.cuando) < 3_600_000)
  if (cambio || agenda.length !== antes) guardarAgenda()
}

// ---------- charla con IA: herramientas que puede usar ----------
const claveIA = () => process.env.GROQ_API_KEY || estado.servidor.ia.clave
const CLAVE_OK = /^[A-Za-z0-9_\-]{10,200}$/
const MODELO_OK = /^[A-Za-z0-9_.\-/:]{1,80}$/
const llamadasIA = [] // para no gastar el cupo gratis por un bucle o un error: máximo 20 por minuto
function cupoLocalIA() {
  const t = Date.now()
  while (llamadasIA.length > 0 && t - llamadasIA[0] > 60_000) llamadasIA.shift()
  if (llamadasIA.length >= 20) return false
  llamadasIA.push(t)
  return true
}
const horaLocal = (ms) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(ms)

function agregarAgenda(c) {
  if (pendientesAgenda().length >= AGENDA_MAX) throw new Error('hay demasiadas cosas pendientes')
  const it = itemAgenda(c, Date.now())
  if (!it) throw new Error('el momento tiene que ser futuro (hasta 400 días)')
  agenda.push(it)
  guardarAgenda()
  return it
}

/** Ejecuta una herramienta pedida por la IA. Devuelve un objeto simple (o tira un Error con el motivo). */
async function herramientaIA(nombre, a) {
  const ahora = Date.now()
  switch (nombre) {
    case 'poner_temporizador': {
      const min = Number(a.minutos)
      if (!Number.isFinite(min) || min <= 0) throw new Error('minutos inválidos')
      const it = agregarAgenda({ tipo: 'temporizador', texto: String(a.etiqueta ?? ''), enMs: Math.round(min * 60_000) })
      return { ok: true, suena_a_las: horaLocal(it.cuando) }
    }
    case 'crear_recordatorio': {
      const texto = String(a.texto ?? '').trim()
      if (!texto) throw new Error('falta el texto')
      let cuando
      if (a.en_minutos != null && Number.isFinite(Number(a.en_minutos))) cuando = ahora + Number(a.en_minutos) * 60_000
      else {
        const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(a.fecha_hora ?? '').trim())
        if (!m) throw new Error('falta en_minutos o fecha_hora con formato AAAA-MM-DD HH:MM')
        cuando = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime()
      }
      const it = agregarAgenda({ tipo: 'recordatorio', texto, cuando: Math.round(cuando) })
      return { ok: true, suena: horaLocal(it.cuando) }
    }
    case 'ver_agenda':
      return {
        pendientes: pendientesAgenda()
          .sort((x, y) => x.cuando - y.cuando)
          .map((i) => ({ tipo: i.tipo, texto: i.texto, en_minutos: Math.max(0, Math.round((i.cuando - ahora) / 60_000)), a_las: horaLocal(i.cuando) })),
      }
    case 'cancelar_agenda': {
      const cuales = String(a.cuales ?? '')
      if (!['temporizador', 'recordatorio', 'todos'].includes(cuales)) throw new Error('cuales inválido')
      const antes = agenda.length
      agenda = agenda.filter((i) => !(i.estado === 'pendiente' && (cuales === 'todos' || i.tipo === cuales)))
      guardarAgenda()
      return { canceladas: antes - agenda.length }
    }
    case 'ver_clima': {
      const { lat, lon, ciudad } = estado.config
      const r = await pedirClima(new Request(`http://local/api/clima?lat=${lat}&lon=${lon}`))
      if (!r.ok) throw new Error('no pude consultar el clima')
      const j = await r.json()
      return {
        ciudad,
        temperatura: j.current?.temperature_2m,
        sensacion: j.current?.apparent_temperature,
        cielo: describirCodigo(j.current?.weather_code),
        maxima_hoy: j.daily?.temperature_2m_max?.[0],
        minima_hoy: j.daily?.temperature_2m_min?.[0],
        probabilidad_lluvia_pct: j.daily?.precipitation_probability_max?.[0],
      }
    }
    case 'ver_impresoras': {
      if (impresoras.ts == null) return { error: 'todavía no llegó ningún informe de las impresoras' }
      return { informe_hace_minutos: Math.round((ahora - impresoras.ts) / 60_000), impresoras: impresoras.impresoras }
    }
    default:
      throw new Error('herramienta desconocida')
  }
}

/** Lee el cuerpo como bytes (para la foto). Corta si supera el máximo. */
function leerBinario(req, max) {
  return new Promise((resolve, reject) => {
    const trozos = []
    let total = 0
    let corte = false
    req.on('data', (c) => {
      if (corte) return // lo que sigue se descarta, pero se lee hasta el final para poder contestar el error
      total += c.length
      if (total > max) {
        corte = true
        trozos.length = 0
        reject(new Error('demasiado grande'))
        return
      }
      trozos.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(trozos)))
    req.on('error', reject)
  })
}

// ---------- fotos de las impresoras (solo en memoria: no se guardan en disco) ----------
const FOTO_MAX_BYTES = 2 * 1024 * 1024
const FOTOS_MAX = 6 // las más recientes; las demás se descartan
const fotos = new Map() // clave de la impresora -> { ts, nombre, buf }
const claveImpresora = (n) => (n || 'general').toLowerCase().replace(/[^a-z0-9ñ_-]+/g, '-').slice(0, 40) || 'general'
const esJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

const json = (res, codigo, obj) => {
  res.writeHead(codigo, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

const soloLocal = () => ['127.0.0.1', 'localhost', '::1'].includes(estado.servidor.escuchar)
const DIRS_LOCALES = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

/** ¿El pedido viene de esta misma PC? (el navegador de la PC, o el celu por el cable USB: llega como localhost) */
const esDeEstaPc = (req) => DIRS_LOCALES.includes(req.socket.remoteAddress ?? '')

/** Anti DNS-rebinding: a lo que llega por localhost, el Host tiene que ser local. */
function hostValido(req) {
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? '')
}

/** Compara el encabezado X-Token con el token guardado, en tiempo constante. */
function tokenValido(req) {
  const t = req.headers['x-token']
  const real = estado.servidor.token
  if (typeof t !== 'string' || !real || t.length !== real.length) return false
  return timingSafeEqual(Buffer.from(t), Buffer.from(real))
}

// ---------- red: otras máquinas (ej. la Raspberry) ----------
function infoRed() {
  const lan = !soloLocal()
  const direcciones = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
  return { lan, puerto: PUERTO, token: lan ? estado.servidor.token : '', direcciones }
}

// ---------- informe de impresoras (lo manda el agente del taller) ----------
const ESTADOS_IMPRESORA = ['imprimiendo', 'libre', 'pausa', 'error', 'offline', 'terminada']
let impresoras = { ts: null, impresoras: [] }

function validarImpresoras(v) {
  if (!Array.isArray(v)) return null
  const out = []
  for (const p of v.slice(0, 20)) {
    if (typeof p !== 'object' || p === null) continue
    const nombre = typeof p.nombre === 'string' ? p.nombre.trim().slice(0, 40) : ''
    if (!nombre || !ESTADOS_IMPRESORA.includes(p.estado)) continue
    const item = { nombre, estado: p.estado }
    if (typeof p.id === 'string') item.id = p.id.slice(0, 40)
    if (typeof p.progreso === 'number' && Number.isFinite(p.progreso)) item.progreso = Math.min(100, Math.max(0, Math.round(p.progreso)))
    if (typeof p.restanteMin === 'number' && Number.isFinite(p.restanteMin) && p.restanteMin >= 0) {
      item.restanteMin = Math.min(100000, Math.round(p.restanteMin))
    }
    if (typeof p.trabajo === 'string') item.trabajo = p.trabajo.trim().slice(0, 80)
    out.push(item)
  }
  return out
}

// ---------- actividad de la PC (teclado y mouse) ----------
// Si estás usando la PC estás sentado, aunque no mires la cámara del celu. Solo se lee "hace cuánto fue la última
// tecla o movimiento" (GetLastInputInfo): no se registra qué se escribe ni dónde se hace clic.
let actividadPc = null // { idleMs, en }
let procesoActividad = null
const GUION_ACTIVIDAD = [
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class NoobyIdle {',
  '  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
  '  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);',
  '  public static uint Ms() { LASTINPUTINFO i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return (uint)Environment.TickCount - i.dwTime; }',
  '}',
  '"@',
  'while ($true) { [NoobyIdle]::Ms(); Start-Sleep -Seconds 5 }',
].join('\n')

function vigilarActividadPc() {
  if (process.platform !== 'win32') return
  procesoActividad = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(GUION_ACTIVIDAD, 'utf16le').toString('base64')],
    { windowsHide: true },
  )
  let resto = ''
  procesoActividad.stdout.on('data', (d) => {
    resto += d.toString('utf8')
    const lineas = resto.split(/\r?\n/)
    resto = lineas.pop() ?? ''
    for (const l of lineas) {
      const n = Number(l.trim())
      if (l.trim() && Number.isFinite(n)) {
        actividadPc = { idleMs: n, en: Date.now() }
        emitir('actividad', { idleMs: n })
      }
    }
  })
  procesoActividad.on('error', (e) => console.log('[actividad] no pude leer la actividad de la PC:', e.message))
  procesoActividad.on('exit', () => {
    procesoActividad = null
    setTimeout(vigilarActividadPc, 10_000)
  })
}
process.on('exit', () => {
  try {
    procesoActividad?.kill()
  } catch {
    /* ya terminó */
  }
})

async function manejar(req, res) {
  if (esDeEstaPc(req)) {
    if (!hostValido(req)) return json(res, 403, { error: 'host no permitido' })
  } else {
    // Otra máquina de la red (ej. la Raspberry): solo puede mandar avisos e informes de impresoras, y con token.
    const ruta0 = new URL(req.url ?? '/', 'http://local').pathname
    const permitido =
      (req.method === 'POST' && (ruta0 === '/api/aviso' || ruta0 === '/api/impresoras' || ruta0 === '/api/foto')) ||
      (req.method === 'GET' && ruta0 === '/api/pedidos')
    if (!permitido) {
      return json(res, 403, { error: 'desde la red solo se aceptan POST /api/aviso, /api/impresoras, /api/foto y GET /api/pedidos' })
    }
    if (!tokenValido(req)) return json(res, 401, { error: 'falta el encabezado X-Token o no coincide' })
  }
  const url = new URL(req.url ?? '/', 'http://local')
  const ruta = url.pathname

  if (ruta === '/api/estado') {
    return json(res, 200, {
      nooby: true,
      version: VERSION,
      puerto: PUERTO,
      celus: [...dispositivos.keys()],
      pantallas: clientes.size,
      actividadPcMs: actividadPc ? actividadPc.idleMs : null,
      impresorasTs: impresoras.ts,
      fotos: fotos.size,
      pedidos: pedidosVigentes().length,
      agenda: pendientesAgenda().length,
      ia: Boolean(claveIA()),
    })
  }

  if (ruta === '/api/config') {
    if (req.method === 'GET') return json(res, 200, estado.config)
    if (req.method === 'PUT') {
      // Si no es JSON, el navegador exige permiso previo (preflight): una web ajena no puede cambiar la config.
      if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
      try {
        estado.config = validarConfig(JSON.parse(await leerCuerpo(req)), estado.config)
        guardar()
        emitir('config', estado.config)
        return json(res, 200, estado.config)
      } catch {
        return json(res, 400, { error: 'JSON inválido' })
      }
    }
  }

  if (ruta === '/api/eventos' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write(`retry: 3000\nevent: config\ndata: ${JSON.stringify(estado.config)}\n\n`)
    if (actividadPc) res.write(`event: actividad\ndata: ${JSON.stringify({ idleMs: actividadPc.idleMs })}\n\n`)
    {
      const ahora = Date.now()
      const vencidos = pendientesAgenda().filter((i) => i.cuando <= ahora)
      for (const it of vencidos) {
        res.write(`event: agenda\ndata: ${JSON.stringify(publicoAgenda(it))}\n\n`)
        it.estado = 'avisado'
        it.avisado = ahora
      }
      if (vencidos.length > 0) guardarAgenda()
    }
    clientes.add(res)
    const latido = setInterval(() => res.write(': ♥\n\n'), 20_000)
    req.on('close', () => {
      clearInterval(latido)
      clientes.delete(res)
    })
    return
  }

  if (ruta === '/api/aviso' && req.method === 'POST') {
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json: {"texto":"..."}' })
    try {
      const { texto, estado: est, impresora } = JSON.parse(await leerCuerpo(req))
      if (typeof texto !== 'string' || !texto.trim()) return json(res, 400, { error: 'falta texto' })
      // Opcionales: con "estado" la cara dibuja la impresora que corresponde (terminada, error…); si no, lo deduce del texto.
      emitir('aviso', {
        texto: texto.trim().slice(0, 300),
        estado: ESTADOS_IMPRESORA.includes(est) ? est : undefined,
        impresora: typeof impresora === 'string' && impresora.trim() ? impresora.trim().slice(0, 40) : undefined,
      })
      return json(res, 200, { ok: true, pantallas: clientes.size })
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
  }

  if (ruta === '/api/entrenar' && req.method === 'POST') {
    // Lo pide el panel: el celu muestra "decí tu frase (1 de 5)" y vuelve con las variantes que entendió.
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
    try {
      const { frase } = JSON.parse(await leerCuerpo(req))
      emitir('entrenar', { frase: validarFrase(frase, estado.config.fraseLlamado) })
      return json(res, 200, { ok: true, pantallas: clientes.size })
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
  }

  if (ruta === '/api/red') {
    if (req.method === 'GET') return json(res, 200, infoRed())
    if (req.method === 'PUT') {
      if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
      try {
        const c = JSON.parse(await leerCuerpo(req))
        const antes = estado.servidor.escuchar
        if (typeof c.lan === 'boolean') estado.servidor.escuchar = c.lan ? '0.0.0.0' : '127.0.0.1'
        if ((!soloLocal() && !estado.servidor.token) || c.regenerarToken === true) {
          estado.servidor.token = randomBytes(24).toString('base64url')
        }
        guardar()
        json(res, 200, infoRed())
        if (estado.servidor.escuchar !== antes) setTimeout(reiniciarEscucha, 150)
        return
      } catch {
        return json(res, 400, { error: 'JSON inválido' })
      }
    }
  }

  if (ruta === '/api/impresoras') {
    if (req.method === 'GET') return json(res, 200, impresoras)
    if (req.method === 'POST') {
      if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
      try {
        const lista = validarImpresoras(JSON.parse(await leerCuerpo(req, 32768)).impresoras)
        if (!lista) return json(res, 400, { error: 'falta "impresoras": [...]' })
        impresoras = { ts: Date.now(), impresoras: lista }
        emitir('impresoras', impresoras)
        return json(res, 200, { ok: true, recibidas: lista.length })
      } catch {
        return json(res, 400, { error: 'JSON inválido' })
      }
    }
  }

  if (ruta === '/api/agenda' && req.method === 'GET') {
    // "ahora" es la hora de la PC: la cara la usa para calcular "mañana a las 9" y las cuentas regresivas sin depender de su reloj.
    return json(res, 200, { ahora: Date.now(), items: pendientesAgenda().sort((a, b) => a.cuando - b.cuando).map(publicoAgenda) })
  }

  if (ruta === '/api/agenda' && req.method === 'POST') {
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
    try {
      if (pendientesAgenda().length >= AGENDA_MAX) return json(res, 429, { error: 'demasiados pendientes' })
      const it = itemAgenda(JSON.parse(await leerCuerpo(req)), Date.now())
      if (!it) return json(res, 400, { error: 'tipo, texto y momento futuro (enMs o cuando)' })
      agenda.push(it)
      guardarAgenda()
      return json(res, 200, { ok: true, id: it.id, cuando: it.cuando })
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
  }

  if (ruta === '/api/agenda/cancelar' && req.method === 'POST') {
    // { "id": "..." } uno; { "tipo": "temporizador" } todos de ese tipo; { "todos": true } todo lo pendiente.
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
    try {
      const c = JSON.parse(await leerCuerpo(req))
      const sacar = (i) => i.estado === 'pendiente' && (c.todos === true || (c.id && i.id === c.id) || (c.tipo && i.tipo === c.tipo))
      const antes = agenda.length
      agenda = agenda.filter((i) => !sacar(i))
      guardarAgenda()
      return json(res, 200, { ok: true, canceladas: antes - agenda.length })
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
  }

  if (ruta === '/api/ia') {
    // Nunca devuelve la clave: solo si hay una y qué modelo se usa.
    if (req.method === 'GET') return json(res, 200, { configurada: Boolean(claveIA()), entorno: Boolean(process.env.GROQ_API_KEY), modelo: estado.servidor.ia.modelo })
    if (req.method === 'PUT') {
      if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
      try {
        const c = JSON.parse(await leerCuerpo(req))
        if (c.borrar === true) estado.servidor.ia.clave = ''
        if (typeof c.clave === 'string' && c.clave.trim()) {
          if (!CLAVE_OK.test(c.clave.trim())) return json(res, 400, { error: 'la clave tiene caracteres raros' })
          estado.servidor.ia.clave = c.clave.trim()
        }
        if (typeof c.modelo === 'string' && c.modelo.trim()) {
          if (!MODELO_OK.test(c.modelo.trim())) return json(res, 400, { error: 'modelo inválido' })
          estado.servidor.ia.modelo = c.modelo.trim()
        }
        guardar()
        return json(res, 200, { configurada: Boolean(claveIA()), entorno: Boolean(process.env.GROQ_API_KEY), modelo: estado.servidor.ia.modelo })
      } catch {
        return json(res, 400, { error: 'JSON inválido' })
      }
    }
  }

  if (ruta === '/api/charla' && req.method === 'POST') {
    // La cara manda lo que oyó (con el historial corto) y recibe qué decir. Solo por localhost.
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
    let c
    try {
      c = JSON.parse(await leerCuerpo(req, 16384))
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
    const historial = limpiarMensajes(c.mensajes)
    if (historial.length === 0) return json(res, 400, { error: 'falta mensajes (el último tiene que ser del usuario)' })
    if (!claveIA()) return json(res, 200, { error: 'sin_clave', texto: ERRORES.sin_clave })
    if (!cupoLocalIA()) return json(res, 200, { error: 'cupo', texto: ERRORES.cupo })
    try {
      const { texto, modelo: usado } = await charlar({
        clave: claveIA(),
        modelo: estado.servidor.ia.modelo,
        historial,
        contexto: {
          nombre: estado.config.nombre,
          ciudad: estado.config.ciudad,
          ahora: new Date(),
          sentadoMin: num(c.sentadoMin, 0, 1440, 0),
        },
        ejecutar: herramientaIA,
      })
      if (usado && usado !== estado.servidor.ia.modelo) {
        // El modelo guardado ya no existía y otro respondió: queda ese para la próxima.
        estado.servidor.ia.modelo = usado
        guardar()
        console.log(`[ia] modelo cambiado a ${usado}`)
      }
      return json(res, 200, { texto })
    } catch (e) {
      const tipo = e instanceof ErrorIA ? e.tipo : 'ia'
      if (!(e instanceof ErrorIA)) console.log('[ia] error:', e)
      else console.log(`[ia] ${tipo}${e.detalle ? ': ' + e.detalle : ''}`)
      return json(res, 200, { error: tipo, texto: ERRORES[tipo] ?? ERRORES.ia, detalle: e instanceof ErrorIA ? e.detalle : undefined })
    }
  }

  if (ruta === '/api/pedidos' && req.method === 'GET') {
    // Lo consulta el agente. Con ?espera=20 la respuesta espera hasta 20 s a que haya un pedido (así contesta casi al instante
    // sin tener que consultar cada segundo).
    const espera = Math.min(25, Math.max(0, Number(url.searchParams.get('espera')) || 0))
    const lista = pedidosVigentes()
    if (lista.length > 0 || espera === 0) return json(res, 200, { pedidos: lista })
    const w = {
      res,
      timer: setTimeout(() => {
        esperandoPedidos.delete(w)
        if (!res.writableEnded) json(res, 200, { pedidos: [] })
      }, espera * 1000),
    }
    esperandoPedidos.add(w)
    res.on('close', () => {
      clearTimeout(w.timer)
      esperandoPedidos.delete(w)
    })
    return
  }

  if (ruta === '/api/pedido' && req.method === 'POST') {
    // Lo manda la cara (por localhost): { "impresora": "H2C" } pide una foto; { "impresora": "H2C", "cancelar": true } la cancela.
    if (!String(req.headers['content-type']).includes('application/json')) return json(res, 415, { error: 'usá application/json' })
    try {
      const c = JSON.parse(await leerCuerpo(req))
      const nombre = String(c.impresora ?? '').trim().slice(0, 40)
      const clave = claveImpresora(nombre)
      if (c.cancelar === true) {
        pedidos.delete(clave)
        return json(res, 200, { ok: true })
      }
      pedidos.set(clave, { id: randomBytes(6).toString('hex'), nombre, clave, hasta: Date.now() + PEDIDO_VIDA_MS })
      despertarEsperando()
      return json(res, 200, { ok: true, clave, esperando: esperandoPedidos.size })
    } catch {
      return json(res, 400, { error: 'JSON inválido' })
    }
  }

  if (ruta === '/api/foto') {
    if (req.method === 'GET') {
      // La pide el celu (por localhost) para mostrarla en el panel.
      const f = fotos.get(claveImpresora(url.searchParams.get('impresora') ?? ''))
      if (!f) return json(res, 404, { error: 'no hay foto' })
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'content-length': f.buf.length })
      return res.end(f.buf)
    }
    if (req.method === 'POST') {
      // La manda el agente de las impresoras: el JPEG tal cual en el cuerpo. La impresora va en ?impresora=H2C
      // (o en el encabezado X-Impresora).
      if (!String(req.headers['content-type']).includes('image/jpeg')) return json(res, 415, { error: 'usá Content-Type: image/jpeg' })
      let buf
      try {
        buf = await leerBinario(req, FOTO_MAX_BYTES)
      } catch {
        res.setHeader('connection', 'close')
        return json(res, 413, { error: 'la foto supera los 2 MB' })
      }
      if (!esJpeg(buf)) return json(res, 400, { error: 'no es un JPEG válido' })
      const nombre = String(url.searchParams.get('impresora') ?? req.headers['x-impresora'] ?? '').trim().slice(0, 40)
      const clave = claveImpresora(nombre)
      fotos.delete(clave) // re-insertar la deja como la más reciente
      fotos.set(clave, { ts: Date.now(), nombre, buf })
      while (fotos.size > FOTOS_MAX) fotos.delete(fotos.keys().next().value)
      pedidos.delete(clave) // llegó la foto que se había pedido: el agente no tiene que mandarla de nuevo
      emitir('foto', { impresora: clave, nombre, ts: Date.now() })
      return json(res, 200, { ok: true, impresora: clave, bytes: buf.length })
    }
  }

  if (ruta === '/api/ciudad' || ruta === '/api/clima') {
    const r = await (ruta === '/api/ciudad' ? pedirCiudad : pedirClima)(new Request('http://local' + req.url))
    res.writeHead(r.status, { 'content-type': 'application/json' })
    return res.end(await r.text())
  }

  if (ruta.startsWith('/api/')) return json(res, 404, { error: 'no existe' })

  // Archivos de la web (dist/)
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'método no permitido' })
  let rel = decodeURIComponent(ruta)
  if (rel.endsWith('/')) rel += 'index.html'
  const archivo = normalize(join(WEB, rel))
  if (archivo !== WEB && !archivo.startsWith(WEB + sep)) return json(res, 403, { error: 'ruta no permitida' })
  if (!existsSync(WEB)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('Falta compilar la web: corré "npm run build" (o "npm run pc").')
  }
  const final = existsSync(archivo) && !archivo.endsWith(sep) ? archivo : join(WEB, 'index.html')
  res.writeHead(200, {
    'content-type': MIME[extname(final)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  res.end(readFileSync(final))
}

const servidorHttp = http.createServer((req, res) => {
  manejar(req, res).catch((e) => {
    console.log('[http] error:', e)
    if (!res.headersSent) json(res, 500, { error: 'error interno' })
  })
})

servidorHttp.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} ya está en uso. Cambialo en ${ARCHIVO} (servidor.puerto) o con NOOBY_PUERTO.`)
  } else console.error(e)
  process.exit(1)
})

let tareasIniciadas = false
function escuchar() {
  servidorHttp.listen(PUERTO, estado.servidor.escuchar, () => {
    const lan = !soloLocal()
    console.log(`Nooby ${VERSION} en http://127.0.0.1:${PUERTO}  (panel: /#/panel)${lan ? '  [acceso desde la red ACTIVADO, con token]' : ''}`)
    console.log(`Config: ${ARCHIVO}`)
    if (tareasIniciadas) return
    tareasIniciadas = true
    void cicloAdb()
    setInterval(() => void cicloAdb(), 4000)
    void puenteNtfy()
    vigilarActividadPc()
    setInterval(revisarAgenda, 1000)
  })
}

/** Cambia entre "solo esta PC" y "también la red" sin matar el proceso. */
function reiniciarEscucha() {
  console.log(`[red] cambiando la escucha a ${estado.servidor.escuchar}`)
  servidorHttp.close(() => escuchar())
  servidorHttp.closeAllConnections?.() // el celu y el panel se reconectan solos
}

escuchar()
