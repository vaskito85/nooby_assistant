import { useEffect, useRef, useState } from 'react'
import { buscarCiudades, type Ciudad } from './lib/clima'

/** Escribís "bahia blanca", aparecen las ciudades y al tocar una queda elegida. */
export function BuscadorCiudad({
  actual,
  alElegir,
}: {
  actual: string
  alElegir: (c: Ciudad) => void
}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Ciudad[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')
  const ctl = useRef<AbortController | null>(null)

  useEffect(() => {
    ctl.current?.abort()
    if (texto.trim().length < 3) {
      setResultados([])
      setError('')
      return
    }
    const c = new AbortController()
    ctl.current = c
    const id = window.setTimeout(async () => {
      setBuscando(true)
      setError('')
      try {
        const r = await buscarCiudades(texto, c.signal)
        if (!c.signal.aborted) {
          setResultados(r)
          if (r.length === 0) setError('No encontré esa ciudad.')
        }
      } catch (e) {
        if (!c.signal.aborted) setError(`No pude buscar (${e instanceof Error ? e.message : 'error'}).`)
      } finally {
        if (!c.signal.aborted) setBuscando(false)
      }
    }, 350)
    return () => {
      window.clearTimeout(id)
      c.abort()
    }
  }, [texto])

  return (
    <div className="buscador">
      <label>
        Ciudad para el clima: <strong>{actual}</strong>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí tu ciudad (ej: Bahía Blanca)"
          autoCapitalize="words"
          autoCorrect="off"
        />
      </label>
      {buscando && <p className="chico">Buscando…</p>}
      {error && <p className="chico">{error}</p>}
      {resultados.length > 0 && (
        <ul className="sugerencias">
          {resultados.map((c) => (
            <li key={`${c.lat},${c.lon}`}>
              <button
                type="button"
                onClick={() => {
                  alElegir(c)
                  setTexto('')
                  setResultados([])
                }}
              >
                <span>{c.nombre}</span>
                <small>{c.detalle}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
