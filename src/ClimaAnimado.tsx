import type { Escena } from './lib/escenas'

// Dibujos animados del tiempo (SVG con animaciones SMIL). Ocupan el mismo cuadro que la cara: nada se corre.
// Las animaciones son lentas y suaves a propósito.

const SOL = '#fbbf24'
const LUNA = '#e2e8f0'
const NUBE_CLARA = '#e2e8f0'
const NUBE_MEDIA = '#cbd5e1'
const NUBE_OSCURA = '#94a3b8'
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

/** Una nube que flota de un lado al otro. (x, y) es el centro de su base; `k` el tamaño. */
function Nube({ x, y, k = 1, color = NUBE_CLARA, dx = 14, dur = 9, demora = 0 }: { x: number; y: number; k?: number; color?: string; dx?: number; dur?: number; demora?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`${-dx} 0;${dx} 0;${-dx} 0`}
          keyTimes="0;0.5;1"
          calcMode="spline"
          keySplines={SPLINE}
          dur={`${dur}s`}
          begin={`${demora}s`}
          repeatCount="indefinite"
        />
        <path d="M-42 0a22 22 0 0 1 8-42 28 28 0 0 1 52-8 24 24 0 0 1 40 14 20 20 0 0 1-4 36z" fill={color} />
      </g>
    </g>
  )
}

function Sol({ x = 120, y = 96, k = 1 }: { x?: number; y?: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {/* resplandor que late */}
      <circle r="30" fill={SOL} opacity="0.3">
        <animate attributeName="r" values="30;46;30" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="3.6s" repeatCount="indefinite" />
      </circle>
      {/* rayos que giran despacio */}
      <g stroke={SOL} strokeWidth="5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="36s" repeatCount="indefinite" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="0" y1="-42" x2="0" y2="-56" transform={`rotate(${i * 30})`} />
        ))}
      </g>
      <circle r="30" fill={SOL} />
    </g>
  )
}

const ESTRELLAS = [
  [40, 40, 0],
  [196, 52, 0.8],
  [64, 150, 1.6],
  [190, 140, 0.4],
  [150, 28, 1.2],
]

function Luna({ x = 120, y = 96, k = 1 }: { x?: number; y?: number; k?: number }) {
  return (
    <g>
      {ESTRELLAS.map(([ex, ey, d], i) => (
        <circle key={i} cx={ex} cy={ey} r="2.4" fill="#f8fafc">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="2.6s" begin={`${d}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <g transform={`translate(${x} ${y}) scale(${k})`}>
        <circle r="30" fill={LUNA} opacity="0.25">
          <animate attributeName="r" values="30;42;30" dur="4.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="4.4s" repeatCount="indefinite" />
        </circle>
        <circle r="30" fill={LUNA} />
        <circle cx="-10" cy="-8" r="6" fill="#cbd5e1" />
        <circle cx="11" cy="6" r="8" fill="#cbd5e1" />
        <circle cx="-4" cy="16" r="4" fill="#cbd5e1" />
      </g>
    </g>
  )
}

/** Gotas de lluvia que caen desde la nube. */
function Lluvia({ cantidad = 12 }: { cantidad?: number }) {
  return (
    <g stroke="#60a5fa" strokeWidth="3" strokeLinecap="round">
      {Array.from({ length: cantidad }, (_, i) => {
        const x = 70 + (i * 100) / cantidad + (i % 2) * 6
        return (
          <line key={i} x1={x} y1="104" x2={x - 3} y2="114">
            <animateTransform attributeName="transform" type="translate" from="0 0" to="-8 64" dur="1.1s" begin={`${(i * 0.19) % 1.1}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.1s" begin={`${(i * 0.19) % 1.1}s`} repeatCount="indefinite" />
          </line>
        )
      })}
    </g>
  )
}

function Copos({ cantidad = 12 }: { cantidad?: number }) {
  return (
    <g fill="#f1f5f9">
      {Array.from({ length: cantidad }, (_, i) => {
        const x = 68 + (i * 104) / cantidad + (i % 3) * 4
        return (
          <circle key={i} cx={x} cy="108" r={i % 2 ? 3.2 : 2.4}>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0;7 22;-7 44;0 66"
              dur={`${3 + (i % 3) * 0.6}s`}
              begin={`${(i * 0.41) % 3}s`}
              repeatCount="indefinite"
            />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.8;1" dur={`${3 + (i % 3) * 0.6}s`} begin={`${(i * 0.41) % 3}s`} repeatCount="indefinite" />
          </circle>
        )
      })}
    </g>
  )
}

/** Franjas de niebla que se desplazan despacio. */
function Niebla() {
  const franjas = [
    { y: 58, ancho: 150, dx: 12, dur: 9 },
    { y: 84, ancho: 118, dx: -14, dur: 11 },
    { y: 110, ancho: 156, dx: 10, dur: 10 },
    { y: 136, ancho: 104, dx: -12, dur: 12 },
  ]
  return (
    <g fill={NUBE_OSCURA}>
      {franjas.map((f, i) => (
        <rect key={i} x={120 - f.ancho / 2} y={f.y} width={f.ancho} height="14" rx="7" opacity="0.65">
          <animateTransform attributeName="transform" type="translate" values={`${-f.dx} 0;${f.dx} 0;${-f.dx} 0`} keyTimes="0;0.5;1" calcMode="spline" keySplines={SPLINE} dur={`${f.dur}s`} repeatCount="indefinite" />
        </rect>
      ))}
    </g>
  )
}

function Rayo() {
  return (
    <polygon points="124,98 104,134 119,134 110,166 140,124 125,124 136,98" fill="#fde047">
      <animate attributeName="opacity" values="0;0;1;0;1;0;0;0" keyTimes="0;0.45;0.48;0.53;0.57;0.66;0.7;1" dur="4s" repeatCount="indefinite" />
    </polygon>
  )
}

export function ClimaAnimado({ escena }: { escena: Escena }) {
  return (
    <div className="imp escena-clima" data-escena={escena} role="img" aria-label={`Clima: ${escena}`}>
      <svg viewBox="0 0 240 192" xmlns="http://www.w3.org/2000/svg">
        {escena === 'sol' && <Sol />}
        {escena === 'luna' && <Luna />}
        {escena === 'solNubes' && (
          <>
            <Sol x={108} y={84} k={0.85} />
            <Nube x={132} y={140} k={1.05} dur={10} />
          </>
        )}
        {escena === 'lunaNubes' && (
          <>
            <Luna x={108} y={84} k={0.85} />
            <Nube x={132} y={140} k={1.05} color={NUBE_MEDIA} dur={10} />
          </>
        )}
        {escena === 'nubes' && (
          <>
            <Nube x={96} y={90} k={0.9} color={NUBE_OSCURA} dx={12} dur={11} />
            <Nube x={146} y={116} k={1.1} color={NUBE_MEDIA} dx={16} dur={8} demora={1} />
            <Nube x={110} y={148} k={1} color={NUBE_CLARA} dx={14} dur={10} demora={2} />
          </>
        )}
        {escena === 'niebla' && <Niebla />}
        {escena === 'lluvia' && (
          <>
            <Nube x={120} y={100} k={1.25} color={NUBE_OSCURA} dx={8} dur={10} />
            <Lluvia />
          </>
        )}
        {escena === 'tormenta' && (
          <>
            <Nube x={120} y={92} k={1.25} color="#64748b" dx={8} dur={10} />
            <Rayo />
            <Lluvia cantidad={8} />
          </>
        )}
        {escena === 'nieve' && (
          <>
            <Nube x={120} y={100} k={1.25} color={NUBE_MEDIA} dx={8} dur={10} />
            <Copos />
          </>
        )}
      </svg>
    </div>
  )
}
