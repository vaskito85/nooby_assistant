// Qué dibujo animado corresponde al tiempo. Lógica pura (sin DOM).

export type Escena = 'sol' | 'luna' | 'solNubes' | 'lunaNubes' | 'nubes' | 'niebla' | 'lluvia' | 'tormenta' | 'nieve'

/**
 * Del código WMO de Open-Meteo al dibujo:
 * 0-1 despejado · 2 algo nublado · 3 nublado · 45/48 niebla · 51-57, 61-67, 80-82 lluvia · 71-77, 85-86 nieve · 95-99 tormenta.
 * De noche, el sol es luna.
 */
export function escenaClima(codigo: number, esDia: boolean): Escena {
  if (codigo === 0 || codigo === 1) return esDia ? 'sol' : 'luna'
  if (codigo === 2) return esDia ? 'solNubes' : 'lunaNubes'
  if (codigo === 3) return 'nubes'
  if (codigo === 45 || codigo === 48) return 'niebla'
  if ((codigo >= 51 && codigo <= 57) || (codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return 'lluvia'
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'nieve'
  if (codigo >= 95) return 'tormenta'
  return 'nubes'
}

/** "despejado" → "Despejado" (para mostrar en pantalla). */
export const capitalizar = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
