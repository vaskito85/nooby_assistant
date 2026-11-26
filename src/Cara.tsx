import { useEffect, useRef } from 'react'

export type Humor = 'normal' | 'feliz' | 'dormido' | 'alerta' | 'hablando' | 'enojado'

export interface Mirada {
  /** -1 (izquierda) a 1 (derecha) */
  x: number
  /** -1 (arriba) a 1 (abajo) */
  y: number
}

const ALCANCE_X = 38 // px que se mueven los ojos como máximo
const ALCANCE_Y = 26

/**
 * La cara: dos ojos que parpadean, una boca y cejas (para el enojo). Todo con CSS.
 * Los ojos siguen a `mirada`; si no hay, miran para cualquier lado de a ratos.
 */
export function Cara({
  humor,
  mirada,
  alTocar,
}: {
  humor: Humor
  mirada: Mirada | null
  alTocar?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Los ojos siguen a la persona (o al dedo).
  useEffect(() => {
    if (!mirada) return
    const el = ref.current
    if (!el) return
    el.style.setProperty('--mx', `${Math.round(mirada.x * ALCANCE_X)}px`)
    el.style.setProperty('--my', `${Math.round(mirada.y * ALCANCE_Y)}px`)
  }, [mirada])

  // Sin a quién mirar, curiosea.
  useEffect(() => {
    if (mirada) return
    const el = ref.current
    if (!el) return
    const id = window.setInterval(() => {
      el.style.setProperty('--mx', `${Math.round((Math.random() - 0.5) * 36)}px`)
      el.style.setProperty('--my', `${Math.round((Math.random() - 0.5) * 20)}px`)
    }, 2600)
    return () => window.clearInterval(id)
  }, [mirada])

  return (
    <div
      className="cara"
      data-humor={humor}
      ref={ref}
      role="img"
      aria-label={`Nooby, ${humor}`}
      onPointerDown={alTocar}
    >
      <div className="ojos">
        <div className="ojo" />
        <div className="ojo" />
      </div>
      <div className="boca" />
      {humor === 'dormido' && <div className="zzz">z z z</div>}
    </div>
  )
}
