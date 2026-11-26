// Dibujos para cuando suena un temporizador (reloj despertador) o un recordatorio (campana).
// Mismo cuadro que la cara: nada se corre. Los movimientos son suaves y lentos a propósito.

const COLOR = 'var(--ojo)'
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

/** Rotación de ida y vuelta alrededor de un punto. */
function Balanceo({ grados, dur, cx, cy }: { grados: number; dur: number; cx: number; cy: number }) {
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      values={`${-grados} ${cx} ${cy};${grados} ${cx} ${cy};${-grados} ${cx} ${cy}`}
      keyTimes="0;0.5;1"
      calcMode="spline"
      keySplines={SPLINE}
      dur={`${dur}s`}
      repeatCount="indefinite"
    />
  )
}

export function RelojAnimado({ tipo }: { tipo: 'temporizador' | 'recordatorio' }) {
  return (
    <div className="imp reloj-alarma" data-tipo={tipo} role="img" aria-label={tipo === 'temporizador' ? 'Reloj despertador' : 'Campana'}>
      <svg viewBox="0 0 240 192" xmlns="http://www.w3.org/2000/svg">
        {tipo === 'temporizador' ? (
          <>
            {/* campanitas que se balancean */}
            <g fill={COLOR}>
              <g>
                <circle cx="78" cy="44" r="17" />
                <Balanceo grados={5} dur={0.9} cx={78} cy={60} />
              </g>
              <g>
                <circle cx="162" cy="44" r="17" />
                <Balanceo grados={5} dur={0.9} cx={162} cy={60} />
              </g>
            </g>
            {/* ondas de sonido que pulsan */}
            <g fill="none" stroke={COLOR} strokeWidth="4" strokeLinecap="round">
              <path d="M30 70q-10 22 0 44">
                <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
              </path>
              <path d="M210 70q10 22 0 44">
                <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
              </path>
            </g>
            {/* el reloj */}
            <circle cx="120" cy="104" r="56" fill="var(--panel)" stroke={COLOR} strokeWidth="6" />
            <g stroke="var(--suave)" strokeWidth="3" strokeLinecap="round">
              {Array.from({ length: 12 }, (_, i) => (
                <line key={i} x1="120" y1="56" x2="120" y2={i % 3 === 0 ? 66 : 61} transform={`rotate(${i * 30} 120 104)`} />
              ))}
            </g>
            <g stroke="var(--texto)" strokeLinecap="round">
              <line x1="120" y1="104" x2="120" y2="70" strokeWidth="5">
                <animateTransform attributeName="transform" type="rotate" from="0 120 104" to="360 120 104" dur="6s" repeatCount="indefinite" />
              </line>
              <line x1="120" y1="104" x2="140" y2="104" strokeWidth="6" />
            </g>
            <circle cx="120" cy="104" r="5" fill={COLOR} />
            <path d="M78 160l-10 14M162 160l10 14" stroke={COLOR} strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* campana con badajo */}
            <g>
              <Balanceo grados={6} dur={1.1} cx={120} cy={38} />
              <circle cx="120" cy="36" r="7" fill={COLOR} />
              <path
                d="M120 42c-30 0-46 24-46 54v22l-12 16h116l-12-16V96c0-30-16-54-46-54z"
                fill="var(--panel)"
                stroke={COLOR}
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <circle cx="120" cy="150" r="11" fill={COLOR}>
                <animateTransform attributeName="transform" type="translate" values="-9 0;9 0;-9 0" keyTimes="0;0.5;1" calcMode="spline" keySplines={SPLINE} dur="1.1s" repeatCount="indefinite" />
              </circle>
            </g>
            <g fill="none" stroke={COLOR} strokeWidth="4" strokeLinecap="round">
              <path d="M34 78q-10 24 0 48">
                <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
              </path>
              <path d="M206 78q10 24 0 48">
                <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
              </path>
            </g>
          </>
        )}
      </svg>
    </div>
  )
}
