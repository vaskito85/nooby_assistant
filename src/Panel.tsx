import { useState } from 'react'
import { BuscadorCiudad } from './BuscadorCiudad'
import { aRemota, cargarPanel, guardarPanel, porDefecto, temaConfig, type Ajustes } from './lib/config'
import type { Ciudad } from './lib/clima'
import { enviarNtfy } from './lib/ntfy'

function temaNuevo() {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return 'nooby-' + [...b].map((x) => x.toString(36).padStart(2, '0')).join('')
}

/** Panel de ajustes: se abre en la PC (`/#/panel`). El celu solo recibe lo que se guarda acá. */
export function Panel() {
  const [a, setA] = useState<Ajustes>(() => {
    const p = cargarPanel()
    if (!p.tema) p.tema = temaNuevo()
    guardarPanel(p)
    return p
  })
  const [estado, setEstado] = useState('')
  const [copiado, setCopiado] = useState(false)

  const cambiar = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => {
    const n = { ...a, [k]: v }
    setA(n)
    guardarPanel(n)
    setEstado('Hay cambios sin enviar al celu.')
  }

  const elegirCiudad = (c: Ciudad) => {
    const n = { ...a, ciudad: c.nombre, lat: c.lat, lon: c.lon }
    setA(n)
    guardarPanel(n)
    setEstado('Hay cambios sin enviar al celu.')
  }

  const enviar = async () => {
    setEstado('Enviando…')
    try {
      await enviarNtfy(a.servidor, temaConfig(a.tema), JSON.stringify(aRemota(a)))
      setEstado('Enviado ✓ El celu lo toma al instante (si está abierto) o la próxima vez que se conecte.')
    } catch (e) {
      setEstado(`No pude enviar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const probar = async () => {
    try {
      await enviarNtfy(a.servidor, a.tema, 'Che, la impresión terminó')
      setEstado('Aviso de prueba enviado: tiene que sonar en el celu.')
    } catch (e) {
      setEstado(`No pude enviar la prueba: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const link =
    `${location.origin}/?tema=${encodeURIComponent(a.tema)}` +
    (a.servidor !== porDefecto.servidor ? `&servidor=${encodeURIComponent(a.servidor)}` : '')

  const copiar = async () => {
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <main className="app panel-pagina">
      <h1>Panel de Nooby</h1>
      <p className="chico">
        Los ajustes se hacen acá, en la PC. El celu solo los recibe: no tiene que tocar nada.
      </p>

      <section className="ajustes">
        <h2>1. Conectar el celu</h2>
        <p className="chico">
          Abrí este link <strong>una sola vez</strong> en el celu. Guarda el tema y desde ahí queda todo conectado.
        </p>
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <button className="boton" onClick={copiar}>
          {copiado ? 'Copiado ✓' : 'Copiar link'}
        </button>
        <p className="chico">
          El link contiene el tema secreto: quien lo tenga puede mandarle avisos al celu. No lo publiques.
        </p>
      </section>

      <section className="ajustes">
        <h2>2. Ajustes</h2>
        <label>
          Avisar sentado cada (min)
          <input
            type="number"
            min={1}
            value={a.sentadoMin}
            onChange={(e) => cambiar('sentadoMin', Math.max(1, Number(e.target.value) || 60))}
          />
        </label>
        <label>
          Recordar agua cada (min, 0 = no)
          <input
            type="number"
            min={0}
            value={a.aguaMin}
            onChange={(e) => cambiar('aguaMin', Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <BuscadorCiudad actual={a.ciudad} alElegir={elegirCiudad} />
        <label className="check">
          <input type="checkbox" checked={a.voz} onChange={(e) => cambiar('voz', e.target.checked)} />
          Hablar en voz alta
        </label>
        <button className="boton principal" onClick={enviar}>
          Enviar al celu
        </button>
        {estado && <p className="chico">{estado}</p>}
      </section>

      <details className="ajustes">
        <summary>Avanzado y pruebas</summary>
        <label>
          Servidor ntfy
          <input value={a.servidor} onChange={(e) => cambiar('servidor', e.target.value.trim())} />
        </label>
        <label>
          Tema secreto
          <input value={a.tema} onChange={(e) => cambiar('tema', e.target.value.trim())} />
        </label>
        <button className="boton" onClick={() => cambiar('tema', temaNuevo())}>
          Generar tema nuevo (hay que volver a abrir el link en el celu)
        </button>
        <button className="boton" onClick={probar}>
          Probar aviso de impresión en el celu
        </button>
      </details>
    </main>
  )
}
