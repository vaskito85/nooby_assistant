import { useEffect, useState } from 'react'
import { Cara } from './Cara'
import { Mirada } from './lib/mirada'
import type { Humor } from './lib/rostro'

const HUMORES: { humor: Humor; nombre: string }[] = [
  { humor: 'normal', nombre: 'Normal' },
  { humor: 'feliz', nombre: 'Feliz' },
  { humor: 'risa', nombre: 'Risa' },
  { humor: 'atento', nombre: 'Atento' },
  { humor: 'hablando', nombre: 'Hablando' },
  { humor: 'pensando', nombre: 'Pensando' },
  { humor: 'confuso', nombre: 'Confuso' },
  { humor: 'sorprendido', nombre: 'Sorprendido' },
  { humor: 'triste', nombre: 'Triste' },
  { humor: 'enojado', nombre: 'Enojado' },
  { humor: 'alerta', nombre: 'Alerta' },
  { humor: 'bostezo', nombre: 'Bostezo' },
  { humor: 'dormido', nombre: 'Dormido' },
]

/** Galería de expresiones (`/#/caras`): sirve para ver todas las caras y probar cómo mueve la boca con un texto. */
export function Caras() {
  const [humor, setHumor] = useState<Humor>('normal')
  const [texto, setTexto] = useState('Hola, soy Nooby. ¿Qué hacemos ahora?')

  useEffect(() => {
    const m = new Mirada(document.documentElement)
    return () => m.detener()
  }, [])

  const decir = () => {
    window.dispatchEvent(new CustomEvent('nooby-habla', { detail: texto }))
    setHumor('hablando')
    window.setTimeout(() => setHumor('normal'), Math.max(1500, (texto.length / 14) * 1000 + 600))
  }

  return (
    <main className="pn caras-galeria">
      <h1 className="pn-titulo">Caras de Nooby</h1>
      <div className="caras-escena">
        <Cara humor={humor} />
      </div>
      <div className="pn-fila caras-botones">
        {HUMORES.map((h) => (
          <button key={h.humor} className="pn-ficha" aria-pressed={humor === h.humor} onClick={() => setHumor(h.humor)}>
            {h.nombre}
          </button>
        ))}
      </div>
      <div className="pn-tarjeta">
        <label className="pn-campo">
          <span>Texto para que la boca lo diga</span>
          <input className="pn-input" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <div className="pn-fila">
          <button className="pn-btn primario" onClick={decir}>
            ▶ Decirlo
          </button>
        </div>
      </div>
    </main>
  )
}
