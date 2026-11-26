import { useEffect, useRef } from 'react'

export type Humor = 'normal' | 'feliz' | 'dormido' | 'alerta' | 'hablando'

/** La cara: dos ojos que parpadean y miran para los costados, y una boca. Todo con CSS. */
export function Cara({ humor }: { humor: Humor }) {
  const ref = useRef<HTMLDivElement>(null)

  // Cada tanto mira para otro lado (solo si está despierto).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const id = window.setInterval(() => {
      const x = Math.round((Math.random() - 0.5) * 36)
      const y = Math.round((Math.random() - 0.5) * 20)
      el.style.setProperty('--mx', `${x}px`)
      el.style.setProperty('--my', `${y}px`)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="cara" data-humor={humor} ref={ref} role="img" aria-label={`Nooby, ${humor}`}>
      <div className="ojos">
        <div className="ojo" />
        <div className="ojo" />
      </div>
      <div className="boca" />
      {humor === 'dormido' && <div className="zzz">z z z</div>}
    </div>
  )
}
