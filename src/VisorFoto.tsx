import { useEffect, useState } from 'react'

const PACIENCIA_MS = 20_000 // si en este tiempo no llegó la foto, se avisa

/**
 * La foto que se pidió, grande y en el lugar de la cara (mismo cuadro: nada se corre).
 * Mientras llega muestra "pidiéndole la foto…"; si tarda demasiado, explica por qué puede ser.
 * Usar con `key` distinta por cada pedido para que la espera arranque de cero.
 */
export function VisorFoto({ url, nombre }: { url?: string; nombre: string }) {
  const [tarde, setTarde] = useState(false)
  const [rota, setRota] = useState<string | null>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setTarde(true), PACIENCIA_MS)
    return () => window.clearTimeout(id)
  }, [])
  const hayFoto = !!url && url !== rota

  return (
    <div className="imp visor-foto">
      {hayFoto ? (
        <img src={url} alt={`Foto de ${nombre}`} onError={() => setRota(url ?? null)} />
      ) : (
        <div className="visor-espera">
          {tarde ? (
            <>
              <p>No me llegó la foto de {nombre}.</p>
              <small>Puede que la impresora no tenga la cámara activa o que el agente no esté respondiendo.</small>
            </>
          ) : (
            <>
              <span className="puntos">• • •</span>
              <p>Pidiéndole la foto a {nombre}…</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
