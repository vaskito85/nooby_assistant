// Presencia por actividad de la PC. Lógica pura (sin DOM).
//
// La cámara del celu solo ve tu cara si la mirás de frente. Sentado frente a la PC, con el celu al costado, no la ve y
// parecía que te habías ido. El servidor de la PC avisa hace cuánto fue la última tecla o movimiento del mouse: si la
// estás usando, estás sentado, mires o no al celu.

/** Si la última tecla o movimiento fue hace menos que esto, se considera que estás usando la PC. */
export const PC_ACTIVA_MS = 90_000
/** Si el servidor dejó de informar hace más que esto, no se supone nada (puede estar apagado o sin PowerShell). */
export const LECTURA_VIGENTE_MS = 30_000

export interface ActividadPc {
  /** Hace cuánto fue la última tecla o movimiento, según la PC, cuando informó. */
  idleMs: number
  /** Cuándo llegó ese informe (Date.now() en el celu). */
  en: number
}

/** ¿Está usando la PC ahora? Cuenta el tiempo que pasó desde que llegó el último informe. */
export function pcActivo(a: ActividadPc | null, ahora: number): boolean {
  if (!a) return false
  const edad = ahora - a.en
  if (edad < 0 || edad > LECTURA_VIGENTE_MS) return false
  return a.idleMs + edad < PC_ACTIVA_MS
}
