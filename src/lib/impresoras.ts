import { distancia, normalizar } from './voz'

// Cómo Nooby cuenta el estado de las impresoras, a partir de lo que informa el agente del taller. Lógica pura.

export type EstadoImpresora = 'imprimiendo' | 'libre' | 'pausa' | 'error' | 'offline' | 'terminada'

export interface Impresora {
  id?: string
  nombre: string
  estado: EstadoImpresora
  /** 0 a 100 */
  progreso?: number
  restanteMin?: number
  trabajo?: string
}

export interface InformeImpresoras {
  /** Cuándo llegó el informe al servidor (ms). null = nunca llegó uno. */
  ts: number | null
  impresoras: Impresora[]
}

/** Un informe más viejo que esto ya no es de fiar. */
export const INFORME_VIGENTE_MS = 15 * 60_000

/** 35 → "35 minutos"; 95 → "1 hora y 35 minutos"; 120 → "2 horas". */
export function duracion(min: number): string {
  const m = Math.round(min)
  if (m < 1) return 'menos de un minuto'
  if (m < 60) return m === 1 ? '1 minuto' : `${m} minutos`
  const h = Math.floor(m / 60)
  const r = m % 60
  const horas = h === 1 ? '1 hora' : `${h} horas`
  if (r === 0) return horas
  return `${horas} y ${r === 1 ? '1 minuto' : `${r} minutos`}`
}

function una(p: Impresora): string {
  switch (p.estado) {
    case 'imprimiendo': {
      const partes = ['está imprimiendo']
      if (p.progreso != null) partes.push(`va por el ${p.progreso} por ciento`)
      if (p.restanteMin != null) partes.push(`faltan ${duracion(p.restanteMin)}`)
      return partes.join(', ')
    }
    case 'libre':
      return 'está libre'
    case 'pausa':
      return 'está en pausa'
    case 'error':
      return 'tiene un error'
    case 'terminada':
      return 'terminó'
    case 'offline':
      return 'está sin conexión'
  }
}

/** Lo que dice Nooby cuando le preguntás por las impresoras. */
export function describirImpresoras(datos: InformeImpresoras, ahora: number): string {
  if (datos.ts == null || datos.impresoras.length === 0) return 'Todavía no tengo información de las impresoras.'
  if (ahora - datos.ts > INFORME_VIGENTE_MS) return 'No tengo datos recientes de las impresoras.'
  return datos.impresoras.map((p) => `${p.nombre} ${una(p)}.`).join(' ')
}

/** Qué dibujo mostrar según el texto del aviso, cuando el agente no manda el estado. Sin pistas: imprimiendo. */
export function inferirEstado(texto: string): EstadoImpresora {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (/\b(fall|error|cort|perd|sin conexion|se rompio|desprend|atasc)/.test(t)) return 'error'
  if (/\bpaus/.test(t)) return 'pausa'
  if (/\b(termin|list[ao]\b|finaliz|complet|acab)/.test(t)) return 'terminada'
  return 'imprimiendo'
}

const PRIORIDAD: Record<EstadoImpresora, number> = {
  error: 0,
  pausa: 1,
  imprimiendo: 2,
  terminada: 3,
  offline: 4,
  libre: 5,
}

/** Lo que más importa primero: errores, pausas, las que están imprimiendo. Mantiene el orden entre iguales. */
export function ordenarPorRelevancia(lista: Impresora[]): Impresora[] {
  return lista
    .map((p, i) => ({ p, i }))
    .sort((a, b) => PRIORIDAD[a.p.estado] - PRIORIDAD[b.p.estado] || a.i - b.i)
    .map((x) => x.p)
}

/** 35 → "35 min"; 95 → "1 h 35 min"; 120 → "2 h". Para pantalla (la voz usa duracion). */
export function duracionCorta(min: number): string {
  const m = Math.round(min)
  if (m < 1) return '<1 min'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

/** Una línea por impresora para el panel lateral: "imprimiendo · 45 % · faltan 1 h 35 min". */
export function resumenCorto(p: Impresora): string {
  switch (p.estado) {
    case 'imprimiendo': {
      const partes = ['imprimiendo']
      if (p.progreso != null) partes.push(`${p.progreso} %`)
      if (p.restanteMin != null) partes.push(`faltan ${duracionCorta(p.restanteMin)}`)
      return partes.join(' · ')
    }
    case 'libre':
      return 'libre'
    case 'pausa':
      return 'en pausa'
    case 'error':
      return 'con error'
    case 'terminada':
      return 'terminó'
    case 'offline':
      return 'sin conexión'
  }
}

// ---------- elegir la impresora por el nombre hablado ----------
// El reconocedor escribe "H2C" como "hache dos ce" y "A1" como "a uno": se traducen letras y números hablados antes de comparar.

const DIGITOS: Record<string, string> = { cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9' }
const LETRAS: Record<string, string> = {
  hache: 'h', ce: 'c', be: 'b', de: 'd', efe: 'f', ge: 'g', jota: 'j', ka: 'k', ele: 'l', eme: 'm',
  ene: 'n', pe: 'p', erre: 'r', ese: 's', te: 't', uve: 'v', equis: 'x', ye: 'y', zeta: 'z',
}

/** "mostrame la hache dos ce" → "mostramelah2c" */
function compactar(texto: string): string {
  return normalizar(texto)
    .split(' ')
    .map((w) => DIGITOS[w] ?? LETRAS[w] ?? w)
    .join('')
}

/** Menor distancia entre `clave` y cualquier trozo del texto de largo parecido. */
function distanciaEnTexto(texto: string, clave: string): number {
  let mejor = Infinity
  for (let largo = Math.max(1, clave.length - 1); largo <= clave.length + 1; largo++) {
    for (let i = 0; i + largo <= texto.length; i++) {
      mejor = Math.min(mejor, distancia(texto.slice(i, i + largo), clave))
    }
  }
  return mejor
}

/** Palabras que identifican a cada impresora: las que no comparte con otra ("bambu" lo comparten H2C y A1: no sirve). */
function clavesDistintivas(lista: Impresora[]): string[][] {
  const tokens = lista.map((p) => normalizar(p.nombre).split(' ').filter(Boolean))
  return tokens.map((mios, i) => {
    const ajenos = new Set(tokens.filter((_, j) => j !== i).flat())
    const claves = mios.filter((t) => !ajenos.has(t) && (t.length >= 2 || /\d/.test(t)))
    if (mios.length > 1 && mios.join('').length >= 4) claves.push(mios.join('')) // "neptune 4" → "neptune4"
    return claves.length > 0 ? claves : [mios.join('')]
  })
}

export interface Elegida {
  impresora: Impresora
  /** true = la nombró; false = no dijo cuál y se eligió la que está imprimiendo (o la primera). */
  porNombre: boolean
}

/** Qué impresora quiso decir. Si no nombró ninguna, la que está imprimiendo. */
export function elegirImpresora(texto: string, lista: Impresora[]): Elegida | null {
  if (lista.length === 0) return null
  const hablado = compactar(texto)
  const claves = clavesDistintivas(lista)
  let mejor: { i: number; d: number; largo: number } | null = null
  claves.forEach((cs, i) => {
    for (const c of cs) {
      const margen = c.length >= 6 ? 1 : 0 // las claves cortas ("a1", "h2c") tienen que coincidir exacto
      const d = distanciaEnTexto(hablado, c)
      if (d <= margen && (!mejor || d < mejor.d || (d === mejor.d && c.length > mejor.largo))) mejor = { i, d, largo: c.length }
    }
  })
  if (mejor) return { impresora: lista[(mejor as { i: number }).i], porNombre: true }
  const imprimiendo = ordenarPorRelevancia(lista).find((p) => p.estado === 'imprimiendo')
  return { impresora: imprimiendo ?? lista[0], porNombre: false }
}
