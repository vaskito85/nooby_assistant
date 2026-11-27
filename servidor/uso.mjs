// Cuánto se usa la inteligencia artificial (Groq): pedidos y tokens de la charla, minutos de audio de Whisper, lo que informa Groq
// sobre el cupo que queda y el último aviso de "se acabó el cupo". Se guarda en ~/.nooby/uso.json (60 días) y se ve en el panel.
// Sin dependencias y sin red: se prueba con una carpeta temporal.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { claveDia } from './bitacora.mjs'

const DIAS_GUARDADOS = 60

const vacioChat = () => ({ pedidos: 0, entrada: 0, salida: 0, errores: 0, cupo: 0 })
const vacioStt = () => ({ pedidos: 0, segundos: 0, errores: 0, cupo: 0 })

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Lo que Groq informa en los encabezados de cada respuesta (pedidos y tokens que quedan, y cuándo se renuevan). */
export function leerLimites(headers) {
  const g = (n) => {
    const v = headers && typeof headers.get === 'function' ? headers.get(n) : null
    return v == null || v === '' ? null : v
  }
  const n = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const l = {
    pedidosLimite: n(g('x-ratelimit-limit-requests')),
    pedidosQuedan: n(g('x-ratelimit-remaining-requests')),
    tokensLimite: n(g('x-ratelimit-limit-tokens')),
    tokensQuedan: n(g('x-ratelimit-remaining-tokens')),
    reinicioPedidos: g('x-ratelimit-reset-requests'),
    reinicioTokens: g('x-ratelimit-reset-tokens'),
  }
  return Object.values(l).some((v) => v !== null) ? l : null
}

/** "Please try again in 7m12.5s" → minutos (redondeado hacia arriba). null si no dice. */
export function esperaDe(texto) {
  const m = /try again in\s+((?:\d+(?:\.\d+)?[hms]\s*)+)/i.exec(String(texto ?? ''))
  if (!m) return null
  let s = 0
  for (const p of m[1].matchAll(/(\d+(?:\.\d+)?)([hms])/g)) s += Number(p[1]) * { h: 3600, m: 60, s: 1 }[p[2]]
  return s > 0 ? Math.max(1, Math.ceil(s / 60)) : null
}

export function crearUso(archivo, { ahora = () => new Date() } = {}) {
  const cargar = () => {
    try {
      const j = JSON.parse(readFileSync(archivo, 'utf8'))
      return { dias: j.dias ?? {}, limites: j.limites ?? {}, ultimoCupo: j.ultimoCupo ?? null, ultimoError: j.ultimoError ?? null }
    } catch {
      return { dias: {}, limites: {}, ultimoCupo: null, ultimoError: null }
    }
  }
  let datos = cargar()

  const guardar = () => {
    // se conservan solo los últimos días
    const claves = Object.keys(datos.dias).sort()
    for (const k of claves.slice(0, Math.max(0, claves.length - DIAS_GUARDADOS))) delete datos.dias[k]
    try {
      if (!existsSync(dirname(archivo))) mkdirSync(dirname(archivo), { recursive: true })
      writeFileSync(archivo, JSON.stringify(datos))
    } catch {
      /* si no se puede guardar, el conteo sigue en memoria */
    }
  }
  const hoy = () => {
    const k = claveDia(ahora())
    return (datos.dias[k] ??= { chat: vacioChat(), stt: vacioStt(), modelos: {} })
  }

  return {
    /** Un pedido que salió bien. tipo: 'chat' (usage de la API) o 'stt' (segundos de audio). */
    registrar({ tipo, modelo, usage, segundos, headers }) {
      const d = hoy()
      if (tipo === 'chat') {
        d.chat.pedidos++
        d.chat.entrada += num(usage?.prompt_tokens)
        d.chat.salida += num(usage?.completion_tokens)
        const m = (d.modelos[modelo] ??= { pedidos: 0, tokens: 0 })
        m.pedidos++
        m.tokens += num(usage?.total_tokens ?? num(usage?.prompt_tokens) + num(usage?.completion_tokens))
      } else if (tipo === 'stt') {
        d.stt.pedidos++
        d.stt.segundos += num(segundos)
      } else return
      const l = leerLimites(headers)
      if (l) datos.limites[tipo] = { ...l, modelo, en: ahora().getTime() }
      guardar()
    },

    /** Un pedido que falló. kind: 'cupo' | 'clave' | 'red' | 'ia' | 'tope_local'. */
    registrarError({ tipo, modelo, kind, detalle, headers }) {
      const d = hoy()
      const bloque = tipo === 'stt' ? d.stt : d.chat
      bloque.errores++
      const en = ahora().getTime()
      if (kind === 'cupo' || kind === 'tope_local') {
        bloque.cupo++
        datos.ultimoCupo = { tipo, modelo: modelo ?? null, kind, detalle: String(detalle ?? '').slice(0, 400), esperaMin: esperaDe(detalle), en }
      } else datos.ultimoError = { tipo, modelo: modelo ?? null, kind, detalle: String(detalle ?? '').slice(0, 300), en }
      const l = leerLimites(headers)
      if (l) datos.limites[tipo] = { ...l, modelo, en }
      guardar()
    },

    /** Todo lo que muestra el panel: hoy, los últimos 7 días, lo que informa Groq y el último aviso de cupo. */
    resumen() {
      const dias = Object.keys(datos.dias)
        .sort()
        .reverse()
        .slice(0, 7)
        .map((dia) => ({ dia, ...datos.dias[dia] }))
      const k = claveDia(ahora())
      return {
        hoy: { dia: k, ...(datos.dias[k] ?? { chat: vacioChat(), stt: vacioStt(), modelos: {} }) },
        dias,
        limites: datos.limites,
        ultimoCupo: datos.ultimoCupo,
        ultimoError: datos.ultimoError,
        ahora: ahora().getTime(),
      }
    },
  }
}
