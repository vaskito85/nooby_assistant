// Cuándo comenta algo al irte o al volver. Lógica pura (sin DOM) para poder probarla con tests.

const MIN = 60_000

export const YA_TE_VAS_MIN_MS = 30_000 // si te fuiste antes de 30 s sentado, fue un parpadeo del detector: no dice nada
export const TRABAJO_POCO_MS = 5 * MIN // "trabajaste poco" si estuviste menos de 5 minutos
export const YA_TE_VAS_ENFRIAR_MS = 10 * MIN // no lo repite más de una vez cada 10 minutos
export const RECREO_MIN_MS = 2 * MIN // ausencia mínima para saludarte al volver (menos es mirar para otro lado)

export type Comentario = 'yaTeVas' | 'holaDeNuevo' | null

export interface Movimiento {
  /** ¿Estabas presente en la lectura anterior? */
  estabaPresente: boolean
  /** ¿Estás presente ahora? (ya incluye los 10 s de tolerancia) */
  estaPresente: boolean
  /** Cuánto llevabas sentado (ms). */
  sentadoMs: number
  ahora: number
  /** La última vez que te vio antes de este momento (0 = nunca). */
  vistaAnterior: number
  /** Cuándo dijo "¿ya te vas?" por última vez (0 = nunca). */
  ultimoYaTeVas: number
}

export function comentarioPorMovimiento(m: Movimiento): Comentario {
  if (m.estabaPresente && !m.estaPresente) {
    // Te fuiste
    if (
      m.sentadoMs >= YA_TE_VAS_MIN_MS &&
      m.sentadoMs < TRABAJO_POCO_MS &&
      m.ahora - m.ultimoYaTeVas > YA_TE_VAS_ENFRIAR_MS
    ) {
      return 'yaTeVas'
    }
    return null
  }
  if (!m.estabaPresente && m.estaPresente && m.vistaAnterior > 0 && m.ahora - m.vistaAnterior >= RECREO_MIN_MS) {
    return 'holaDeNuevo' // Volviste después de un rato
  }
  return null
}

export const FRASE_YA_TE_VAS = '¿Ya te vas? Trabajaste poco.'
export const FRASE_HOLA_DE_NUEVO = '¡Hola de nuevo! ¿Cómo estuvo el recreo? ¿Qué hacemos ahora?'
