import { useEffect, useState } from 'react'
import { BuscadorCiudad } from './BuscadorCiudad'
import {
  avisoLocal,
  entrenarLocal,
  guardarRed,
  leerImpresoras,
  leerRed,
  estadoLocal,
  charlarIA,
  guardarIA,
  leerIA,
  type InfoIA,
  guardarConfigLocal,
  leerConfigLocal,
  type EstadoServidor,
  type Red,
} from './lib/canalLocal'
import type { Ciudad } from './lib/clima'
import { aRemota, aplicarRemota, cargarPanel, guardarPanel, limpiarLlamadas, porDefecto, temaConfig, type Ajustes } from './lib/config'
import { describirImpresoras, type InformeImpresoras } from './lib/impresoras'
import { enviarNtfy } from './lib/ntfy'
import { CATALOGO } from './lib/voz'

function temaNuevo() {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return 'nooby-' + [...b].map((x) => x.toString(36).padStart(2, '0')).join('')
}

/**
 * Panel de ajustes (`/#/panel`). Se abre en la PC. Hay dos modos:
 *  - local: lo sirve el servidor de la PC (USB). Guarda ahí y el celu lo recibe por el cable.
 *  - ntfy: versión de Vercel. Publica la config en ntfy y el celu la toma por internet.
 */
export function Panel() {
  const [modo, setModo] = useState<'detectando' | 'local' | 'ntfy'>('detectando')
  const [servidor, setServidor] = useState<EstadoServidor | null>(null)
  const [a, setA] = useState<Ajustes>(() => {
    const p = cargarPanel()
    if (!p.tema) p.tema = temaNuevo()
    guardarPanel(p)
    return p
  })
  const [estado, setEstado] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [red, setRed] = useState<Red | null>(null)
  const [informe, setInforme] = useState<InformeImpresoras>({ ts: null, impresoras: [] })
  const [copiadoToken, setCopiadoToken] = useState(false)
  const [ia, setIa] = useState<InfoIA | null>(null)
  const [claveIa, setClaveIa] = useState('')
  const [modeloIa, setModeloIa] = useState('')
  const [notaIa, setNotaIa] = useState('')

  // Detecta el modo y, si es local, trae la config guardada en la PC.
  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      const e = await estadoLocal()
      if (!vivo) return
      setServidor(e)
      setModo((m) => (m === 'detectando' ? (e ? 'local' : 'ntfy') : m))
      if (e) {
        // Las variantes de la frase de despertar las entrena el celu: se traen siempre del servidor.
        try {
          const cfg = (await leerConfigLocal()) as { llamadas?: unknown }
          if (vivo) setA((prev) => ({ ...prev, llamadas: limpiarLlamadas(cfg.llamadas) }))
          const [r, i] = await Promise.all([leerRed(), leerImpresoras()])
          if (vivo) {
            setRed(r)
            setInforme(i)
          }
        } catch {
          /* se reintenta en 3 s */
        }
      }
      return e
    }
    void mirar().then(async (e) => {
      if (!e || !vivo) return
      try {
        const cfg = await leerConfigLocal()
        if (vivo) setA((prev) => aplicarRemota(prev, cfg))
      } catch {
        /* queda la local */
      }
    })
    const id = window.setInterval(() => void mirar(), 3000) // estado del cable
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [])

  const marcar = (n: Ajustes) => {
    setA(n)
    guardarPanel(n)
    setEstado('Hay cambios sin enviar al celu.')
  }
  const cambiar = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => marcar({ ...a, [k]: v })
  const elegirCiudad = (c: Ciudad) => marcar({ ...a, ciudad: c.nombre, lat: c.lat, lon: c.lon })

  const enviar = async () => {
    setEstado('Enviando…')
    try {
      if (modo === 'local') {
        await guardarConfigLocal(aRemota(a))
        setEstado('Guardado ✓ El celu lo toma al instante.')
      } else {
        await enviarNtfy(a.servidor, temaConfig(a.tema), JSON.stringify(aRemota(a)))
        setEstado('Enviado ✓ El celu lo toma al instante (si está abierto) o la próxima vez que se conecte.')
      }
    } catch (e) {
      setEstado(`No pude enviar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const probar = async () => {
    try {
      if (modo === 'local') await avisoLocal('Che, la impresión terminó')
      else await enviarNtfy(a.servidor, a.tema, 'Che, la impresión terminó')
      setEstado('Aviso de prueba enviado: tiene que sonar en el celu.')
    } catch (e) {
      setEstado(`No pude enviar la prueba: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  // Charla con IA: la clave se guarda en la PC y nunca vuelve a mostrarse.
  useEffect(() => {
    if (modo !== 'local') return
    void leerIA()
      .then((i) => {
        setIa(i)
        setModeloIa((m) => m || i.modelo)
      })
      .catch(() => undefined)
  }, [modo])

  const guardarClaveIa = async (cambio: { clave?: string; modelo?: string; borrar?: boolean }) => {
    try {
      const i = await guardarIA(cambio)
      setIa(i)
      setClaveIa('')
      setNotaIa(cambio.borrar ? 'Clave borrada.' : 'Guardado ✓')
    } catch (e) {
      setNotaIa(`No pude guardar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const probarIa = async () => {
    setNotaIa('Probando…')
    try {
      const r = await charlarIA([{ rol: 'yo', texto: 'Presentate en una frase corta.' }], 0)
      setNotaIa(r.error ? `No anduvo: ${r.texto}${r.detalle ? ` (${r.detalle})` : ''}` : `Anda ✓ Nooby dice: «${r.texto}»`)
    } catch (e) {
      setNotaIa(`No pude probar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const entrenar = async () => {
    try {
      const r = await entrenarLocal(a.fraseLlamado)
      setEstado(
        r.pantallas > 0
          ? 'Mirá el celu: te va a pedir que digas la frase 5 veces.'
          : 'No hay ningún celu con la cara abierta. Abrí Nooby en el celu y probá de nuevo.',
      )
    } catch (e) {
      setEstado(`No pude iniciar el entrenamiento: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const quitarVariante = async (v: string | null) => {
    const llamadas = v === null ? [] : a.llamadas.filter((x) => x !== v)
    setA((p) => ({ ...p, llamadas }))
    try {
      await guardarConfigLocal({ llamadas })
    } catch (e) {
      setEstado(`No pude guardar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const cambiarRed = async (cambio: { lan?: boolean; regenerarToken?: boolean }) => {
    try {
      setRed(await guardarRed(cambio))
    } catch (e) {
      setEstado(`No pude cambiar la red: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const copiarToken = async () => {
    if (!red?.token) return
    await navigator.clipboard.writeText(red.token)
    setCopiadoToken(true)
    window.setTimeout(() => setCopiadoToken(false), 2000)
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

      {modo === 'local' ? (
        <section className="ajustes">
          <h2>1. El celu</h2>
          {servidor && servidor.celus.length > 0 ? (
            <p>
              ✓ Celu conectado por USB ({servidor.celus.join(', ')}).{' '}
              {servidor.pantallas > 0 ? 'La cara está abierta.' : 'Abrí la app Nooby en el celu.'}
            </p>
          ) : (
            <p>
              Sin celu por USB. Enchufalo con el cable y activá la <strong>depuración USB</strong> (Opciones de
              desarrollador). Aparece solo cuando lo conectás.
            </p>
          )}
          <p className="chico">
            Los avisos de impresión van a <code>POST http://127.0.0.1:{servidor?.puerto}/api/aviso</code> con JSON{' '}
            <code>{'{"texto":"..."}'}</code>.
          </p>
        </section>
      ) : (
        modo === 'ntfy' && (
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
        )
      )}

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
        <label>
          Cómo te llama (para "Sí, ...")
          <input value={a.nombre} maxLength={30} onChange={(e) => cambiar('nombre', e.target.value)} />
        </label>
        <BuscadorCiudad actual={a.ciudad} alElegir={elegirCiudad} />
        <label className="check">
          <input type="checkbox" checked={a.voz} onChange={(e) => cambiar('voz', e.target.checked)} />
          Hablar en voz alta
        </label>
        <button className="boton principal" onClick={enviar}>
          {modo === 'local' ? 'Guardar y enviar al celu' : 'Enviar al celu'}
        </button>
        {estado && <p className="chico">{estado}</p>}
      </section>

      <section className="ajustes">
        <h2>3. Despertar a Nooby</h2>
        <p className="chico">
          El modelo de voz no conoce la palabra "nooby", así que se la enseñás con tu voz: el celu te pide repetir la frase 5
          veces y guarda cómo la entiende. Podés enseñarle más de una frase ("hola nooby", "nobby"…): escribila acá y volvé a
          entrenar.
        </p>
        <label>
          Frase para despertarlo
          <input value={a.fraseLlamado} maxLength={40} onChange={(e) => cambiar('fraseLlamado', e.target.value)} />
        </label>
        {modo === 'local' ? (
          <>
            <button className="boton principal" onClick={entrenar}>
              Entrenar con mi voz (en el celu)
            </button>
            {a.llamadas.length > 0 ? (
              <>
                <p className="chico">Lo que aprendió (tocá una para quitarla):</p>
                <div className="fichas">
                  {a.llamadas.map((v) => (
                    <button key={v} className="ficha" onClick={() => void quitarVariante(v)} title="Quitar">
                      «{v}» ✕
                    </button>
                  ))}
                </div>
                <button className="boton" onClick={() => void quitarVariante(null)}>
                  Borrar todo lo aprendido
                </button>
              </>
            ) : (
              <p className="chico">Todavía no aprendió ninguna: por ahora despierta con "che nube" (lo más parecido que conoce).</p>
            )}
          </>
        ) : (
          <p className="chico">El entrenamiento necesita el modo USB (el servidor de la PC con el celu enchufado).</p>
        )}
      </section>

      <section className="ajustes">
        <h2>4. Conectar la Raspberry y otras máquinas</h2>
        {modo === 'local' ? (
          <>
            <p className="chico">
              Para que el agente de las impresoras (en otra máquina) le hable a Nooby hay que abrir el acceso por la red local.
              Solo acepta avisos e informes de impresoras, y siempre con el token. Todo lo demás (este panel, tus ajustes) sigue
              cerrado a la red.
            </p>
            <button className="boton" onClick={() => void cambiarRed({ lan: !red?.lan })}>
              {red?.lan ? 'Cerrar el acceso desde la red' : 'Abrir el acceso desde la red'}
            </button>
            {red?.lan && (
              <>
                <p>
                  Dirección: <code>http://{red.direcciones[0] ?? 'IP-DE-ESTA-PC'}:{red.puerto}</code>
                </p>
                <label>
                  Token (encabezado <code>X-Token</code>)
                  <input readOnly value={red.token} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <button className="boton" onClick={() => void copiarToken()}>
                  {copiadoToken ? 'Copiado ✓' : 'Copiar token'}
                </button>
                <button className="boton" onClick={() => void cambiarRed({ regenerarToken: true })}>
                  Generar token nuevo (hay que cargarlo de nuevo en el otro agente)
                </button>
                <p className="chico">
                  Si la PC cambia de IP, la dirección cambia: conviene fijarla en el router. Las instrucciones para el otro agente
                  están en <code>docs/integracion-agente.md</code>.
                </p>
              </>
            )}
            <p className="chico">
              Impresoras:{' '}
              {informe.ts == null
                ? 'todavía no llegó ningún informe.'
                : `último informe hace ${Math.max(0, Math.round((Date.now() - informe.ts) / 1000))} s. ${describirImpresoras(informe, Date.now())}`}
            </p>
          </>
        ) : (
          <p className="chico">Necesita el modo USB (el servidor de la PC con el celu enchufado).</p>
        )}
      </section>

      <section className="ajustes">
        <h2>5. Charla libre (inteligencia artificial)</h2>
        {modo === 'local' ? (
          <>
            <p className="chico">
              Lo que Nooby no entiende por las frases fijas se lo pregunta a una IA (Groq, plan gratis), que además puede poner
              temporizadores y recordatorios, ver el clima y las impresoras. La clave se guarda solo en esta PC: no pasa por el celu.
              Sacala gratis en <code>console.groq.com</code> (API Keys).
            </p>
            <p>{ia?.configurada ? '✓ Hay una clave cargada.' : 'Todavía no hay clave: Nooby sigue con las frases fijas.'}</p>
            <label>
              Clave de Groq (empieza con gsk_)
              <input
                type="password"
                autoComplete="off"
                placeholder={ia?.configurada ? 'Pegá otra para reemplazarla' : 'gsk_…'}
                value={claveIa}
                onChange={(e) => setClaveIa(e.target.value)}
              />
            </label>
            <label>
              Modelo
              <input value={modeloIa} maxLength={80} onChange={(e) => setModeloIa(e.target.value)} />
            </label>
            <button className="boton" onClick={() => void guardarClaveIa({ clave: claveIa, modelo: modeloIa })}>
              Guardar
            </button>
            <button className="boton" disabled={!ia?.configurada} onClick={() => void probarIa()}>
              Probar
            </button>
            {ia?.configurada && !ia.entorno && (
              <button className="boton" onClick={() => void guardarClaveIa({ borrar: true })}>
                Borrar la clave
              </button>
            )}
            {notaIa && <p className="chico">{notaIa}</p>}
          </>
        ) : (
          <p className="chico">Necesita el modo USB (el servidor de la PC con el celu enchufado).</p>
        )}
      </section>

      <details className="ajustes">
        <summary>Qué le puedo decir a Nooby</summary>
        <p className="chico">
          Primero despertalo con tu frase ("che nooby…") y esperá a que diga "Sí, {a.nombre}". Después decí cualquiera de estas
          (no hace falta que sean idénticas, entiende variantes):
        </p>
        <ul className="frases">
          {CATALOGO.map((g) => (
            <li key={g.orden}>
              <strong>{g.titulo}</strong>
              <span>{g.ejemplos.map((e) => `«${e}»`).join('  ')}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="ajustes">
        <summary>Avanzado y pruebas</summary>
        {modo === 'ntfy' && (
          <>
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
          </>
        )}
        <button className="boton" onClick={probar}>
          Probar aviso de impresión en el celu
        </button>
      </details>
    </main>
  )
}
