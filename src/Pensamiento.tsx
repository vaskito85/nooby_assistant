/** Globito pensador de la cara: una PC con tilde verde (conectada) o cruz roja (sin conexión). */
export function Pensamiento({ visible, ok }: { visible: boolean; ok: boolean }) {
  return (
    <div className={`pensamiento${visible ? ' visible' : ''}`} aria-hidden={!visible} role="status">
      <svg className="pc" viewBox="0 0 48 48" aria-label="PC">
        <rect x="6" y="8" width="36" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M17 41h14M24 32v9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {ok ? (
        <svg className="marca ok" viewBox="0 0 24 24" aria-label="conectada">
          <path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="marca mal" viewBox="0 0 24 24" aria-label="sin conexión">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
