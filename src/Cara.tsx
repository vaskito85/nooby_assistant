import { useEffect, useId, useRef } from 'react'
import type { Humor } from './lib/rostro'
import { RostroVivo } from './lib/rostroVivo'

export type { Humor } from './lib/rostro'

/**
 * La cara: un dibujo SVG de proporción fija (500 × 400) con ojos (blanco, iris, pupila y párpados), cejas, mejillas y una boca con
 * labios, dientes y lengua. Ningún gesto cambia el tamaño del cuadro, así el resto de la pantalla no se mueve. RostroVivo la anima
 * (parpadeo, humor, boca que sigue las letras) y los ojos siguen a la persona con --gx/--gy (ver mirada.ts).
 * audio.ts avisa con el evento "nooby-habla" qué texto se va a decir para que la boca lo acompañe.
 */
export function Cara({ humor, alTocar }: { humor: Humor; alTocar?: () => void }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const vivo = useRef<RostroVivo | null>(null)

  useEffect(() => {
    if (!svg.current) return
    const r = new RostroVivo(svg.current)
    vivo.current = r
    r.poner(humor)
    const alHablar = (e: Event) => vivo.current?.hablar(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('nooby-habla', alHablar)
    return () => {
      window.removeEventListener('nooby-habla', alHablar)
      r.detener()
      vivo.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    vivo.current?.poner(humor)
    if (humor !== 'hablando') vivo.current?.callar()
  }, [humor])

  const recorteOjo = `ro${id}`
  const recorteBoca = `rb${id}`

  return (
    <div className="cara" data-humor={humor} role="img" aria-label={`Nooby, ${humor}`} onPointerDown={alTocar}>
      <svg ref={svg} viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <clipPath id={recorteOjo}>
            <ellipse cx="0" cy="0" rx="58" ry="66" />
          </clipPath>
          <clipPath id={recorteBoca}>
            <path data-parte="bocaClip" d="" />
          </clipPath>
        </defs>

        {/* la placa de la cara */}
        <rect className="placa-aro" x="6" y="6" width="488" height="388" rx="176" />
        <rect className="placa" x="14" y="14" width="472" height="372" rx="170" />

        <g data-parte="rasgos">
          <g data-parte="mejillas" className="mejillas">
            <ellipse cx="96" cy="236" rx="38" ry="22" />
            <ellipse cx="404" cy="236" rx="38" ry="22" />
          </g>

          {(['I', 'D'] as const).map((lado) => (
            <g key={lado} data-parte={`ojo${lado}`} transform={`translate(${lado === 'I' ? 150 : 350} 150)`}>
              <ellipse className="ojo-blanco" rx="58" ry="66" />
              <g clipPath={`url(#${recorteOjo})`}>
                <g className="iris">
                  <circle className="iris-color" r="40" />
                  <circle className="iris-borde" r="40" />
                  <circle className="pupila" r="20" />
                  <circle className="brillo" cx="-13" cy="-15" r="10" />
                  <circle className="brillo chico" cx="13" cy="13" r="5" />
                </g>
                <rect data-parte={`lidSup${lado}`} className="parpado" x="-110" y="-150" width="220" height="150" transform="translate(0 -66)" />
                <ellipse data-parte={`lidInf${lado}`} className="parpado" cx="0" cy="134" rx="90" ry="72" />
              </g>
              <ellipse className="ojo-borde" rx="58" ry="66" />
            </g>
          ))}

          <path data-parte="cejaI" className="ceja" d="" />
          <path data-parte="cejaD" className="ceja" d="" />

          <g className="boca">
            <path data-parte="bocaRelleno" className="boca-interior" d="" />
            <g clipPath={`url(#${recorteBoca})`}>
              <rect data-parte="dientes" className="dientes" x="0" y="0" width="0" height="0" rx="6" />
              <ellipse data-parte="lengua" className="lengua" cx="250" cy="320" rx="30" ry="10" />
            </g>
            <path data-parte="bocaLinea" className="labios" d="" />
          </g>
        </g>

        {/* detalles que aparecen según el humor (se muestran con CSS) */}
        <text className="extra extra-zzz" x="396" y="64">
          z z z
        </text>
        <text className="extra extra-duda" x="404" y="74">
          ?
        </text>
        <g className="extra extra-puntos">
          <circle cx="388" cy="62" r="7" />
          <circle cx="414" cy="62" r="7" />
          <circle cx="440" cy="62" r="7" />
        </g>
        <path className="extra extra-gota" d="M452 120 q-14 24 0 36 q14 -12 0 -36z" />
      </svg>
    </div>
  )
}
