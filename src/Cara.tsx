export type Humor = 'normal' | 'feliz' | 'dormido' | 'alerta' | 'hablando' | 'enojado'

/**
 * La cara. Todo está en posiciones fijas dentro de un cuadro de proporción fija: ningún gesto cambia el
 * tamaño de nada, así el resto de la pantalla no se mueve. Los ojos se desplazan con --gx/--gy (ver mirada.ts).
 */
export function Cara({ humor, alTocar }: { humor: Humor; alTocar?: () => void }) {
  return (
    <div className="cara" data-humor={humor} role="img" aria-label={`Nooby, ${humor}`} onPointerDown={alTocar}>
      <div className="ojos">
        <div className="ojo" />
        <div className="ojo" />
      </div>
      <div className="boca" />
      {humor === 'dormido' && <div className="zzz">z z z</div>}
    </div>
  )
}
