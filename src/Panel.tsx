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

type Seccion = 'inicio' | 'ajustes' | 'voz' | 'ia' | 'red' | 'frases' | 'avanzado'

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
  const [seccion, setSeccion] = useState<Seccion>(() => (sessionStorage.getItem('nooby-panel') as Seccion | null) ?? 'inicio')
  const irA = (s: Seccion) => {
    setSeccion(s)
    sessionStorage.setItem('nooby-panel', s)
    window.scrollTo({ top: 0 })
  }

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

  const guardarClaveIa = async (cambio: { clave?: string; modelo?: string; borrar?: boolean; whisper?: boolean }) => {
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

  const local = modo === 'local'
  const celuOk = !!servidor && servidor.celus.length > 0
  const caraAbierta = !!servidor && servidor.pantallas > 0
  const segInforme = informe.ts == null ? null : Math.max(0, Math.round((Date.now() - informe.ts) / 1000))
  const soloUsb = <p className="pn-ayuda">Esto necesita el modo USB (el servidor de la PC con el celu enchufado).</p>

  const secciones: { id: Seccion; icono: string; nombre: string }[] = [
    { id: 'inicio', icono: '🏠', nombre: 'Inicio' },
    { id: 'ajustes', icono: '⚙️', nombre: 'Ajustes' },
    { id: 'voz', icono: '🎙️', nombre: 'Despertar' },
    { id: 'ia', icono: '✨', nombre: 'Charla IA' },
    { id: 'red', icono: '🖨️', nombre: 'Impresoras' },
    { id: 'frases', icono: '💬', nombre: 'Qué decirle' },
    { id: 'avanzado', icono: '🧰', nombre: 'Avanzado' },
  ]

  const Estado = ({ ok, titulo, detalle, ir }: { ok: boolean | null; titulo: string; detalle: string; ir: Seccion }) => (
    <button className="pn-estado" data-ok={ok === null ? 'neutro' : ok ? 'si' : 'no'} onClick={() => irA(ir)}>
      <span className="pn-punto" aria-hidden />
      <span className="pn-estado-texto">
        <strong>{titulo}</strong>
        <small>{detalle}</small>
      </span>
    </button>
  )

  return (
    <main className="pn">
      <header className="pn-cabecera">
        <div className="pn-logo" aria-hidden>
          <span />
          <span />
        </div>
        <div>
          <h1>Nooby</h1>
          <p>Panel de control · los ajustes se hacen acá y el celu los recibe solo</p>
        </div>
      </header>

      <div className="pn-cuerpo">
        <nav className="pn-nav" aria-label="Secciones">
          {secciones.map((s) => (
            <button key={s.id} className="pn-nav-item" aria-current={seccion === s.id ? 'page' : undefined} onClick={() => irA(s.id)}>
              <span className="pn-nav-icono" aria-hidden>
                {s.icono}
              </span>
              <span>{s.nombre}</span>
            </button>
          ))}
        </nav>

        <div className="pn-contenido">
          {seccion === 'inicio' && (
            <>
              <h2 className="pn-titulo">Cómo está todo</h2>
              <div className="pn-estados">
                {local ? (
                  <Estado
                    ok={celuOk ? caraAbierta : false}
                    titulo="Celu"
                    detalle={celuOk ? (caraAbierta ? 'Conectado y con la cara abierta' : 'Conectado: abrí la app Nooby') : 'Sin cable USB'}
                    ir="inicio"
                  />
                ) : (
                  <Estado ok={null} titulo="Celu" detalle="Se conecta con un link (modo internet)" ir="avanzado" />
                )}
                <Estado ok={local ? !!ia?.configurada : null} titulo="Charla con IA" detalle={ia?.configurada ? 'Lista para conversar' : 'Falta cargar la clave'} ir="ia" />
                <Estado
                  ok={segInforme == null ? false : segInforme < 600}
                  titulo="Impresoras"
                  detalle={segInforme == null ? 'Todavía no llegó ningún informe' : `Último informe hace ${segInforme < 90 ? `${segInforme} s` : `${Math.round(segInforme / 60)} min`}`}
                  ir="red"
                />
                <Estado ok={local ? !!red?.lan : null} titulo="Acceso desde la red" detalle={red?.lan ? 'Abierto (con token)' : 'Cerrado'} ir="red" />
                <Estado ok={a.llamadas.length > 0} titulo="Frase de despertar" detalle={a.llamadas.length > 0 ? `${a.llamadas.length} variantes aprendidas` : 'Sin entrenar'} ir="voz" />
              </div>

              {local ? (
                <div className="pn-tarjeta">
                  <h3>Conectar el celu</h3>
                  {celuOk ? (
                    <p>
                      Celu conectado por USB ({servidor?.celus.join(', ')}). {caraAbierta ? 'La cara está abierta.' : 'Abrí la app Nooby en el celu.'}
                    </p>
                  ) : (
                    <p>
                      Enchufalo con el cable y activá la <strong>depuración USB</strong> (Opciones de desarrollador). Aparece solo cuando lo
                      conectás.
                    </p>
                  )}
                  <p className="pn-ayuda">
                    Los avisos de impresión van a <code>POST http://127.0.0.1:{servidor?.puerto}/api/aviso</code> con JSON{' '}
                    <code>{'{"texto":"..."}'}</code>.
                  </p>
                </div>
              ) : (
                modo === 'ntfy' && (
                  <div className="pn-tarjeta">
                    <h3>Conectar el celu</h3>
                    <p>
                      Abrí este link <strong>una sola vez</strong> en el celu. Guarda el tema y desde ahí queda todo conectado.
                    </p>
                    <input className="pn-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                    <div className="pn-fila">
                      <button className="pn-btn primario" onClick={copiar}>
                        {copiado ? 'Copiado ✓' : 'Copiar link'}
                      </button>
                    </div>
                    <p className="pn-ayuda">El link contiene el tema secreto: quien lo tenga puede mandarle avisos al celu. No lo publiques.</p>
                  </div>
                )
              )}

              <div className="pn-tarjeta">
                <h3>Probar</h3>
                <p>Mandale un aviso de prueba: tiene que sonar y aparecer en la cara del celu.</p>
                <div className="pn-fila">
                  <button className="pn-btn secundario" onClick={probar}>
                    🔔 Probar aviso de impresión
                  </button>
                </div>
                {estado && <p className="pn-nota">{estado}</p>}
              </div>
            </>
          )}

          {seccion === 'ajustes' && (
            <>
              <h2 className="pn-titulo">Ajustes</h2>
              <div className="pn-tarjeta">
                <h3>Recordatorios</h3>
                <div className="pn-dos">
                  <label className="pn-campo">
                    <span>Avisar sentado cada (min)</span>
                    <input
                      className="pn-input"
                      type="number"
                      min={1}
                      value={a.sentadoMin}
                      onChange={(e) => cambiar('sentadoMin', Math.max(1, Number(e.target.value) || 60))}
                    />
                  </label>
                  <label className="pn-campo">
                    <span>Recordar agua cada (min, 0 = no)</span>
                    <input
                      className="pn-input"
                      type="number"
                      min={0}
                      value={a.aguaMin}
                      onChange={(e) => cambiar('aguaMin', Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                </div>
              </div>
              <div className="pn-tarjeta">
                <h3>Vos y tu ciudad</h3>
                <label className="pn-campo">
                  <span>Cómo te llama (para "Sí, …")</span>
                  <input className="pn-input" value={a.nombre} maxLength={30} onChange={(e) => cambiar('nombre', e.target.value)} />
                </label>
                <BuscadorCiudad actual={a.ciudad} alElegir={elegirCiudad} />
                <label className="pn-interruptor">
                  <input type="checkbox" checked={a.voz} onChange={(e) => cambiar('voz', e.target.checked)} />
                  <span className="pn-palanca" aria-hidden />
                  <span>Hablar en voz alta</span>
                </label>
              </div>
              <div className="pn-fila">
                <button className="pn-btn primario grande" onClick={enviar}>
                  {local ? 'Guardar y enviar al celu' : 'Enviar al celu'}
                </button>
              </div>
              {estado && <p className="pn-nota">{estado}</p>}
            </>
          )}

          {seccion === 'voz' && (
            <>
              <h2 className="pn-titulo">Despertar a Nooby</h2>
              <div className="pn-tarjeta">
                <p>
                  El modelo de voz no conoce la palabra "nooby", así que se la enseñás con tu voz: el celu te pide repetir la frase 5 veces y
                  guarda cómo la entiende. Podés enseñarle más de una frase ("hola nooby", "nobby"…): escribila y volvé a entrenar.
                </p>
                <label className="pn-campo">
                  <span>Frase para despertarlo</span>
                  <input className="pn-input" value={a.fraseLlamado} maxLength={40} onChange={(e) => cambiar('fraseLlamado', e.target.value)} />
                </label>
                {local ? (
                  <>
                    <div className="pn-fila">
                      <button className="pn-btn primario" onClick={entrenar}>
                        🎙️ Entrenar con mi voz (en el celu)
                      </button>
                    </div>
                    {estado && <p className="pn-nota">{estado}</p>}
                  </>
                ) : (
                  soloUsb
                )}
              </div>
              {local && (
                <div className="pn-tarjeta">
                  <h3>Lo que aprendió</h3>
                  {a.llamadas.length > 0 ? (
                    <>
                      <p className="pn-ayuda">Tocá una para quitarla.</p>
                      <div className="pn-fichas">
                        {a.llamadas.map((v) => (
                          <button key={v} className="pn-ficha" onClick={() => void quitarVariante(v)} title="Quitar">
                            «{v}» ✕
                          </button>
                        ))}
                      </div>
                      <div className="pn-fila">
                        <button className="pn-btn peligro" onClick={() => void quitarVariante(null)}>
                          Borrar todo lo aprendido
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>Todavía no aprendió ninguna: por ahora despierta con "che nube" (lo más parecido que conoce).</p>
                  )}
                </div>
              )}
              <p className="pn-ayuda">Acordate de tocar «Guardar y enviar al celu» en Ajustes si cambiaste la frase.</p>
            </>
          )}

          {seccion === 'ia' && (
            <>
              <h2 className="pn-titulo">Charla libre con inteligencia artificial</h2>
              {local ? (
                <>
                  <div className="pn-tarjeta">
                    <p>
                      Lo que Nooby no entiende por las frases fijas se lo pregunta a una IA (Groq, plan gratis). Además puede poner
                      temporizadores y recordatorios, ver el clima y las impresoras. La clave se guarda solo en esta PC: no pasa por el celu.
                    </p>
                    <p className="pn-ayuda">
                      Sacá una clave gratis en <code>console.groq.com</code> → API Keys.
                    </p>
                    <p className="pn-insignia" data-ok={ia?.configurada ? 'si' : 'no'}>
                      {ia?.configurada ? '✓ Hay una clave cargada' : 'Todavía no hay clave: Nooby sigue con las frases fijas'}
                    </p>
                  </div>
                  <div className="pn-tarjeta">
                    <label className="pn-campo">
                      <span>Clave de Groq (empieza con gsk_)</span>
                      <input
                        className="pn-input"
                        type="password"
                        autoComplete="off"
                        placeholder={ia?.configurada ? 'Pegá otra para reemplazarla' : 'gsk_…'}
                        value={claveIa}
                        onChange={(e) => setClaveIa(e.target.value)}
                      />
                    </label>
                    <label className="pn-campo">
                      <span>Modelo</span>
                      <input className="pn-input" value={modeloIa} maxLength={80} onChange={(e) => setModeloIa(e.target.value)} />
                    </label>
                    <label className="pn-interruptor">
                      <input type="checkbox" checked={ia?.whisper !== false} onChange={(e) => void guardarClaveIa({ whisper: e.target.checked })} />
                      <span className="pn-palanca" aria-hidden />
                      <span>Entender mejor lo que digo (Whisper de Groq)</span>
                    </label>
                    <p className="pn-ayuda">
                      Con esto el audio de lo que le decís a Nooby (después de despertarlo) se manda a Groq para transcribirlo con Whisper, que
                      entiende mucho mejor que el reconocedor del celu. La palabra de despertar sigue siendo local. Si lo apagás, todo queda en
                      el celu. Necesita la app del celu actualizada.
                    </p>
                    <div className="pn-fila">
                      <button className="pn-btn primario" onClick={() => void guardarClaveIa({ clave: claveIa, modelo: modeloIa })}>
                        Guardar
                      </button>
                      <button className="pn-btn secundario" disabled={!ia?.configurada} onClick={() => void probarIa()}>
                        Probar
                      </button>
                      {ia?.configurada && !ia.entorno && (
                        <button className="pn-btn peligro" onClick={() => void guardarClaveIa({ borrar: true })}>
                          Borrar la clave
                        </button>
                      )}
                    </div>
                    {notaIa && <p className="pn-nota">{notaIa}</p>}
                  </div>
                </>
              ) : (
                <div className="pn-tarjeta">{soloUsb}</div>
              )}
            </>
          )}

          {seccion === 'red' && (
            <>
              <h2 className="pn-titulo">Impresoras y otras máquinas</h2>
              {local ? (
                <>
                  <div className="pn-tarjeta">
                    <h3>Estado de las impresoras</h3>
                    <p>
                      {informe.ts == null
                        ? 'Todavía no llegó ningún informe.'
                        : `Último informe hace ${segInforme} s. ${describirImpresoras(informe, Date.now())}`}
                    </p>
                  </div>
                  <div className="pn-tarjeta">
                    <h3>Acceso desde la red</h3>
                    <p>
                      Para que el agente de las impresoras (en otra máquina) le hable a Nooby hay que abrir el acceso por la red local. Solo
                      acepta avisos e informes de impresoras, y siempre con el token. Todo lo demás (este panel, tus ajustes) sigue cerrado.
                    </p>
                    <label className="pn-interruptor">
                      <input type="checkbox" checked={!!red?.lan} onChange={() => void cambiarRed({ lan: !red?.lan })} />
                      <span className="pn-palanca" aria-hidden />
                      <span>{red?.lan ? 'Abierto a la red local' : 'Cerrado (solo esta PC)'}</span>
                    </label>
                    {red?.lan && (
                      <>
                        <p>
                          Dirección: <code>http://{red.direcciones[0] ?? 'IP-DE-ESTA-PC'}:{red.puerto}</code>
                        </p>
                        <label className="pn-campo">
                          <span>
                            Token (encabezado <code>X-Token</code>)
                          </span>
                          <input className="pn-input" readOnly value={red.token} onFocus={(e) => e.currentTarget.select()} />
                        </label>
                        <div className="pn-fila">
                          <button className="pn-btn secundario" onClick={() => void copiarToken()}>
                            {copiadoToken ? 'Copiado ✓' : 'Copiar token'}
                          </button>
                          <button className="pn-btn peligro" onClick={() => void cambiarRed({ regenerarToken: true })}>
                            Generar token nuevo
                          </button>
                        </div>
                        <p className="pn-ayuda">
                          Con un token nuevo hay que cargarlo de nuevo en el otro agente. Si la PC cambia de IP, la dirección cambia: conviene
                          fijarla en el router. Instrucciones para el otro agente: <code>docs/integracion-agente.md</code>.
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="pn-tarjeta">{soloUsb}</div>
              )}
            </>
          )}

          {seccion === 'frases' && (
            <>
              <h2 className="pn-titulo">Qué le puedo decir a Nooby</h2>
              <div className="pn-tarjeta">
                <p>
                  Primero despertalo con tu frase ("che nooby…") y esperá a que diga "Sí, {a.nombre}". Después decí cualquiera de estas (no
                  hace falta que sean idénticas, entiende variantes). Si no entiende, se lo pregunta a la IA.
                </p>
              </div>
              <div className="pn-frases">
                {CATALOGO.map((g) => (
                  <div key={g.orden} className="pn-frase">
                    <strong>{g.titulo}</strong>
                    <span>{g.ejemplos.map((e) => `«${e}»`).join('  ')}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {seccion === 'avanzado' && (
            <>
              <h2 className="pn-titulo">Avanzado</h2>
              <div className="pn-tarjeta">
                <h3>Pruebas</h3>
                <div className="pn-fila">
                  <button className="pn-btn secundario" onClick={probar}>
                    🔔 Probar aviso de impresión en el celu
                  </button>
                </div>
                {estado && <p className="pn-nota">{estado}</p>}
              </div>
              {modo === 'ntfy' && (
                <div className="pn-tarjeta">
                  <h3>Modo internet (ntfy)</h3>
                  <label className="pn-campo">
                    <span>Servidor ntfy</span>
                    <input className="pn-input" value={a.servidor} onChange={(e) => cambiar('servidor', e.target.value.trim())} />
                  </label>
                  <label className="pn-campo">
                    <span>Tema secreto</span>
                    <input className="pn-input" value={a.tema} onChange={(e) => cambiar('tema', e.target.value.trim())} />
                  </label>
                  <div className="pn-fila">
                    <button className="pn-btn peligro" onClick={() => cambiar('tema', temaNuevo())}>
                      Generar tema nuevo (hay que volver a abrir el link en el celu)
                    </button>
                  </div>
                </div>
              )}
              {local && <p className="pn-ayuda">Servidor Nooby {servidor?.version} · puerto {servidor?.puerto}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
