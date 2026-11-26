import type { EstadoImpresora } from './lib/impresoras'

const CAPAS = 10 // el objeto se "imprime" en 10 capas
const PERIODO_S = 7 // segundos que tarda en imprimirse entero antes de volver a empezar
const ALTO_CAPA = 6
const PASO_CAPA = 7 // alto + 1 de separación: se ven las capas

/**
 * La cara de Nooby cuando llega un aviso de la impresora: una impresora 3D dibujada, del mismo tamaño que la cara
 * (así la pantalla no se mueve). Imprimiendo: el cabezal barre y el objeto crece capa por capa. Terminada: objeto
 * completo con tilde verde. Error: objeto roto con cruz roja. Pausa: cabezal quieto con el símbolo de pausa.
 */
export function ImpresoraAnimada({ estado }: { estado: EstadoImpresora }) {
  const imprimiendo = estado === 'imprimiendo'
  const capasFijas = estado === 'terminada' ? CAPAS : estado === 'error' ? 5 : estado === 'pausa' ? 6 : estado === 'libre' ? 0 : CAPAS
  // Cabezal: barre mientras imprime; si terminó, queda estacionado a un lado.
  const cabezalX = estado === 'terminada' ? 46 : 0

  return (
    <div className="imp" data-estado={estado} role="img" aria-label={`Impresora 3D: ${estado}`}>
      <svg viewBox="0 0 240 192" xmlns="http://www.w3.org/2000/svg">
        {/* estructura: base, columnas, viga, riel, cama */}
        <g className="imp-marco" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="26" y="164" width="188" height="14" rx="4" />
          <path d="M48 164V30h144v134" />
          <path d="M60 44h120" />
          <rect x="66" y="148" width="108" height="8" rx="2" />
        </g>

        {/* objeto, capa por capa */}
        <g className="imp-objeto">
          {Array.from({ length: CAPAS }, (_, i) => {
            const y = 148 - ALTO_CAPA - i * PASO_CAPA
            if (!imprimiendo) {
              return i < capasFijas ? (
                // en error la última capa sale corrida: el objeto se rompió
                <rect key={i} x={estado === 'error' && i === capasFijas - 1 ? 108 : 100} y={y} width="40" height={ALTO_CAPA} rx="1" />
              ) : null
            }
            const aparece = (0.5 + i * 0.55) / PERIODO_S
            return (
              <rect key={i} x="100" y={y} width="40" height={ALTO_CAPA} rx="1" opacity="0">
                <animate
                  attributeName="opacity"
                  dur={`${PERIODO_S}s`}
                  repeatCount="indefinite"
                  values="0;0;1;1;0"
                  keyTimes={`0;${aparece.toFixed(3)};${(aparece + 0.001).toFixed(3)};0.94;1`}
                />
              </rect>
            )
          })}
        </g>

        {/* cabezal con la boquilla */}
        <g transform={`translate(${cabezalX} 0)`}>
          {imprimiendo && (
            <animateTransform
              attributeName="transform"
              type="translate"
              dur="2.2s"
              repeatCount="indefinite"
              values="-40 0;40 0;-40 0"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
          )}
          <rect className="imp-cabezal" x="106" y="36" width="28" height="18" rx="4" />
          <path className="imp-cabezal" d="M114 54h12l-6 12z" />
        </g>

        {/* distintivo del estado */}
        {estado === 'terminada' && (
          <g>
            <circle className="imp-ok" cx="214" cy="28" r="18" />
            <path d="M205 28l7 7 12-14" fill="none" stroke="#04201c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        {estado === 'error' && (
          <g>
            <circle className="imp-mal" cx="214" cy="28" r="18" />
            <path d="M206 20l16 16M222 20l-16 16" fill="none" stroke="#2a0a12" strokeWidth="4.5" strokeLinecap="round" />
          </g>
        )}
        {estado === 'pausa' && (
          <g>
            <circle className="imp-pausa" cx="214" cy="28" r="18" />
            <path d="M208 20v16M220 20v16" fill="none" stroke="#2a1a04" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  )
}
