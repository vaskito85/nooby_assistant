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
