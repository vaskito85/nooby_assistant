import { useEffect, useState } from 'react'
import { BuscadorCiudad } from './BuscadorCiudad'
import {
  avisoLocal,
  entrenarLocal,
  guardarRed,
  leerImpresoras,
  leerRed,
  estadoLocal,
  accionLista,
  compararModelos,
  leerListas,
  type ListaVista,
  type ResultadoModelo,
  leerUso,
  type ResumenUso,
  agregarMemoria,
  borrarDiaBitacora,
  borrarMemoria,
  buscarBitacora,
  leerDiaBitacora,
  leerDiasBitacora,
  leerMemoria,
  type DatoMemoria,
  type EntradaBitacora,
  type ResultadoBitacora,
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

type Seccion = 'inicio' | 'ajustes' | 'voz' | 'ia' | 'uso' | 'listas' | 'bitacora' | 'red' | 'frases' | 'avanzado'

const numero = (n: number) => n.toLocaleString('es-AR')
const minutosDe = (seg: number) => (seg < 90 ? Math.round(seg) + ' s' : (seg / 60).toFixed(1).replace('.', ',') + ' min')
function haceCuanto(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return s + ' s'
  const m = Math.round(s / 60)
  if (m < 90) return m + ' min'
  const h = Math.round(m / 60)
  return h < 36 ? h + ' h' : Math.round(h / 24) + ' días'
}

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
  // Listas
  const [listas, setListas] = useState<ListaVista[]>([])
  const [nuevoItem, setNuevoItem] = useState<Record<string, string>>({})
  const [nuevaLista, setNuevaLista] = useState('')
  const [notaListas, setNotaListas] = useState('')
  // Comparar modelos
  const [comparacion, setComparacion] = useState<{ resultados: ResultadoModelo[]; actual: string } | null>(null)
  const [comparando, setComparando] = useState(false)
  // Uso de la IA (tokens, cupo)
  const [uso, setUso] = useState<ResumenUso | null>(null)
  // Bitácora y memoria
  const [diasBit, setDiasBit] = useState<{ dia: string; entradas: number }[]>([])
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [entradasBit, setEntradasBit] = useState<EntradaBitacora[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBit, setResultadosBit] = useState<ResultadoBitacora[] | null>(null)
  const [datosMem, setDatosMem] = useState<DatoMemoria[]>([])
  const [nuevoDato, setNuevoDato] = useState('')
  const [notaBit, setNotaBit] = useState('')
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

  const cargarBitacora = async (elegir?: string) => {
    try {
      const { hoy, dias } = await leerDiasBitacora()
      setDiasBit(dias)
      const dia = elegir ?? diaSel ?? (dias.find((d) => d.dia === hoy) ?? dias[0])?.dia ?? null
      setDiaSel(dia)
      setEntradasBit(dia ? await leerDiaBitacora(dia) : [])
      setDatosMem(await leerMemoria())
    } catch (e) {
      setNotaBit(`No pude leer la bitácora: ${e instanceof Error ? e.message : 'error'}`)
    }
  }
  useEffect(() => {
    if (modo === 'local' && seccion === 'bitacora') void cargarBitacora()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, seccion])

  const buscarEnBitacora = async () => {
    if (!busqueda.trim()) {
      setResultadosBit(null)
      return
    }
    try {
      setResultadosBit(await buscarBitacora(busqueda))
    } catch (e) {
      setNotaBit(`No pude buscar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }
  const borrarDia = async (dia: string) => {
    if (!window.confirm(`¿Borrar la bitácora del ${dia}? No se puede deshacer.`)) return
    try {
      await borrarDiaBitacora(dia)
      setDiaSel(null)
      setNotaBit('Día borrado.')
      await cargarBitacora()
    } catch (e) {
      setNotaBit(`No pude borrar: ${e instanceof Error ? e.message : 'error'}`)
    }
  }
  const sumarDato = async () => {
    if (!nuevoDato.trim()) return
    try {
      await agregarMemoria(nuevoDato)
      setNuevoDato('')
      setDatosMem(await leerMemoria())
    } catch (e) {
      setNotaBit(`No pude guardar el dato: ${e instanceof Error ? e.message : 'error'}`)
    }
  }
  const sacarDato = async (id: string) => {
    try {
      await borrarMemoria(id)
      setDatosMem(await leerMemoria())
    } catch (e) {
      setNotaBit(`No pude borrar el dato: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  // El uso se refresca solo mientras se mira (inicio o uso).
  useEffect(() => {
    if (modo !== 'local' || (seccion !== 'uso' && seccion !== 'inicio')) return
    let vivo = true
    const traer = () => leerUso().then((u) => vivo && setUso(u)).catch(() => undefined)
    void traer()
    const id = window.setInterval(() => void traer(), 5000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [modo, seccion])

  const traerListas = async () => {
    try {
      setListas(await leerListas())
    } catch (e) {
      setNotaListas('No pude leer las listas: ' + (e instanceof Error ? e.message : 'error'))
    }
  }
  useEffect(() => {
    if (modo === 'local' && seccion === 'listas') void traerListas()
  }, [modo, seccion])
  const sobreLista = async (cuerpo: Parameters<typeof accionLista>[0]) => {
    try {
      await accionLista(cuerpo)
      await traerListas()
    } catch (e) {
      setNotaListas('No pude hacerlo: ' + (e instanceof Error ? e.message : 'error'))
    }
  }

  const comparar = async () => {
    setComparando(true)
    setComparacion(null)
    setNotaIa('Probando los modelos… tarda unos 30 segundos y gasta unos 15 mil tokens.')
    try {
      const r = await compararModelos()
      if ('error' in r) setNotaIa(r.error === 'sin_clave' ? 'Primero cargá la clave de Groq.' : 'No pude comparar: ' + r.error)
      else {
        setComparacion(r)
        setNotaIa('')
      }
    } catch (e) {
      setNotaIa('No pude comparar: ' + (e instanceof Error ? e.message : 'error'))
    } finally {
      setComparando(false)
    }
  }

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
  // ¿Groq avisó que se acabó el cupo hace poco? (en la última hora; si pasó más, ya debería andar)
  const sinCupoAhora = !!uso?.ultimoCupo && uso.ultimoCupo.kind === 'cupo' && uso.ahora - uso.ultimoCupo.en < 3_600_000
  const soloUsb = <p className="pn-ayuda">Esto necesita el modo USB (el servidor de la PC con el celu enchufado).</p>

  const secciones: { id: Seccion; icono: string; nombre: string }[] = [
    { id: 'inicio', icono: '🏠', nombre: 'Inicio' },
    { id: 'ajustes', icono: '⚙️', nombre: 'Ajustes' },
    { id: 'voz', icono: '🎙️', nombre: 'Despertar' },
    { id: 'ia', icono: '✨', nombre: 'Charla IA' },
    { id: 'uso', icono: '📊', nombre: 'Uso de la IA' },
    { id: 'listas', icono: '✅', nombre: 'Listas' },
    { id: 'bitacora', icono: '📓', nombre: 'Bitácora' },
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
                <Estado
                  ok={local ? !!ia?.configurada && !sinCupoAhora : null}
                  titulo="Charla con IA"
                  detalle={!ia?.configurada ? 'Falta cargar la clave' : sinCupoAhora ? 'Sin cupo en Groq (ver Uso de la IA)' : 'Lista para conversar'}
                  ir={sinCupoAhora ? 'uso' : 'ia'}
                />
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
                  <div className="pn-tarjeta">
                    <h3>Elegir el mejor modelo</h3>
                    <p>
                      Prueba cada modelo gratis de Groq con cuatro pedidos típicos de Nooby (saludo, temporizador, lista y un recordatorio sin hora) y te
                      muestra cuál acierta más y más rápido. Las herramientas son de mentira: no crea nada.
                    </p>
                    <div className="pn-fila">
                      <button className="pn-btn secundario" disabled={comparando || !ia?.configurada} onClick={() => void comparar()}>
                        {comparando ? 'Probando…' : 'Comparar modelos'}
                      </button>
                    </div>
                    {comparacion && (
                      <div className="pn-bit-lista">
                        {comparacion.resultados.map((m) => (
                          <div key={m.modelo} className="pn-modelo" data-actual={m.modelo === comparacion.actual ? 'si' : undefined}>
                            <b>{m.modelo}</b>
                            <span>
                              {m.aciertos} de {m.de} bien · {(m.msPromedio / 1000).toFixed(1).replace('.', ',')} s por pedido · {m.tokens.toLocaleString('es-AR')} tokens
                            </span>
                            {m.filas.map((f) => (
                              <small key={f.id} className="pn-ayuda">
                                {f.ok ? '✓' : '✗'} {f.id}: {f.error ? f.error : (f.llamadas.length > 0 ? '[' + f.llamadas.join(', ') + '] ' : '') + f.texto}
                              </small>
                            ))}
                            {m.modelo !== comparacion.actual ? (
                              <div className="pn-fila">
                                <button className="pn-btn primario" onClick={() => void guardarClaveIa({ modelo: m.modelo }).then(() => setComparacion({ ...comparacion, actual: m.modelo }))}>
                                  Usar este
                                </button>
                              </div>
                            ) : (
                              <small className="pn-ayuda">✓ Es el que se usa ahora.</small>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="pn-tarjeta">{soloUsb}</div>
              )}
            </>
          )}

          {seccion === 'uso' && (
            <>
              <h2 className="pn-titulo">Uso de la inteligencia artificial</h2>
              {!local ? (
                <div className="pn-tarjeta">{soloUsb}</div>
              ) : !uso ? (
                <div className="pn-tarjeta">
                  <p className="pn-ayuda">Cargando…</p>
                </div>
              ) : (
                <>
                  {uso.ultimoCupo && uso.ahora - uso.ultimoCupo.en < 24 * 3_600_000 && (
                    <div className="pn-tarjeta pn-alerta">
                      <h3>{uso.ultimoCupo.kind === 'tope_local' ? '⏸ Tope de Nooby' : '⚠ Groq avisó que se acabó el cupo'}</h3>
                      <p>{uso.ultimoCupo.detalle || 'Sin detalle.'}</p>
                      <p className="pn-ayuda">
                        {uso.ultimoCupo.tipo === 'stt' ? 'Fue en la voz (Whisper)' : 'Fue en la charla'}
                        {uso.ultimoCupo.modelo ? ' · modelo ' + uso.ultimoCupo.modelo : ''} · hace {haceCuanto(uso.ahora - uso.ultimoCupo.en)}
                        {uso.ultimoCupo.esperaMin ? ' · volver a probar en unos ' + uso.ultimoCupo.esperaMin + ' min' : ''}
                      </p>
                    </div>
                  )}

                  <div className="pn-estados">
                    <div className="pn-dato">
                      <small>Charla hoy</small>
                      <strong>{uso.hoy.chat.pedidos} pedidos</strong>
                      <span>{numero(uso.hoy.chat.entrada + uso.hoy.chat.salida)} tokens</span>
                      <span className="pn-ayuda">
                        {numero(uso.hoy.chat.entrada)} de entrada · {numero(uso.hoy.chat.salida)} de salida
                      </span>
                    </div>
                    <div className="pn-dato">
                      <small>Voz (Whisper) hoy</small>
                      <strong>{uso.hoy.stt.pedidos} transcripciones</strong>
                      <span>{minutosDe(uso.hoy.stt.segundos)} de audio</span>
                    </div>
                    <div className="pn-dato" data-mal={uso.hoy.chat.cupo + uso.hoy.stt.cupo > 0 ? 'si' : undefined}>
                      <small>Avisos de cupo hoy</small>
                      <strong>{uso.hoy.chat.cupo + uso.hoy.stt.cupo}</strong>
                      <span className="pn-ayuda">{uso.hoy.chat.errores + uso.hoy.stt.errores} errores en total</span>
                    </div>
                  </div>

                  {(uso.limites.chat || uso.limites.stt) && (
                    <div className="pn-tarjeta">
                      <h3>Lo que informa Groq</h3>
                      {(['chat', 'stt'] as const).map((k) => {
                        const l = uso.limites[k]
                        if (!l) return null
                        return (
                          <div key={k} className="pn-limite">
                            <b>{k === 'chat' ? 'Charla' : 'Voz'}</b>
                            {l.pedidosQuedan != null && (
                              <span>
                                Pedidos que quedan: <b>{numero(l.pedidosQuedan)}</b>
                                {l.pedidosLimite != null ? ' de ' + numero(l.pedidosLimite) : ''}
                                {l.reinicioPedidos ? ' (se renueva en ' + l.reinicioPedidos + ')' : ''}
                              </span>
                            )}
                            {l.tokensQuedan != null && (
                              <span>
                                Tokens que quedan (por minuto): <b>{numero(l.tokensQuedan)}</b>
                                {l.tokensLimite != null ? ' de ' + numero(l.tokensLimite) : ''}
                                {l.reinicioTokens ? ' (se renueva en ' + l.reinicioTokens + ')' : ''}
                              </span>
                            )}
                            <small className="pn-ayuda">Dato de hace {haceCuanto(uso.ahora - l.en)}</small>
                          </div>
                        )
                      })}
                      <p className="pn-ayuda">
                        Groq cuenta por modelo y el límite diario de tokens no viene en estos datos: lo ves exacto en <code>console.groq.com</code>{' '}
                        → Settings → Limits. Cuando se acaba, el aviso de arriba dice cuánto falta para volver a usarlo.
                      </p>
                    </div>
                  )}

                  <div className="pn-tarjeta">
                    <h3>Últimos días</h3>
                    {uso.dias.length === 0 ? (
                      <p className="pn-ayuda">Todavía no hay datos. Se empiezan a contar desde esta versión.</p>
                    ) : (
                      <div className="pn-tabla">
                        <div className="pn-fila-tabla cab">
                          <span>Día</span>
                          <span>Pedidos</span>
                          <span>Tokens</span>
                          <span>Audio</span>
                          <span>Cupo</span>
                        </div>
                        {uso.dias.map((d) => (
                          <div key={d.dia} className="pn-fila-tabla">
                            <span>{d.dia}</span>
                            <span>{d.chat.pedidos}</span>
                            <span>{numero(d.chat.entrada + d.chat.salida)}</span>
                            <span>{minutosDe(d.stt.segundos)}</span>
                            <span data-mal={d.chat.cupo + d.stt.cupo > 0 ? 'si' : undefined}>{d.chat.cupo + d.stt.cupo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {Object.keys(uso.hoy.modelos).length > 0 && (
                      <p className="pn-ayuda">
                        Hoy por modelo:{' '}
                        {Object.entries(uso.hoy.modelos)
                          .map(([m, v]) => m + ' (' + v.pedidos + ' pedidos, ' + numero(v.tokens) + ' tokens)')
                          .join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="pn-fila">
                    <button className="pn-btn secundario" onClick={() => void probarIa()}>
                      Probar si ya anda
                    </button>
                  </div>
                  {notaIa && <p className="pn-nota">{notaIa}</p>}
                  <p className="pn-ayuda">También se lo podés preguntar a Nooby: «cuántos tokens llevo hoy» o «me quedé sin cupo».</p>
                </>
              )}
            </>
          )}

          {seccion === 'listas' && (
            <>
              <h2 className="pn-titulo">Listas</h2>
              {!local ? (
                <div className="pn-tarjeta">{soloUsb}</div>
              ) : (
                <>
                  <div className="pn-tarjeta">
                    <p>
                      Listas de verdad: compras, pendientes, lo que quieras. Por voz: «agregá leche y pan a la lista de compras», «qué hay en la lista»,
                      «tachá leche», «sacá el pan de la lista», «vaciá la lista». También se las podés pedir a la IA ("dalas vuelta", "poné esto primero").
                    </p>
                    {notaListas && <p className="pn-nota">{notaListas}</p>}
                    <div className="pn-fila pn-busca">
                      <input
                        className="pn-input"
                        value={nuevaLista}
                        maxLength={40}
                        placeholder="Nombre de una lista nueva (ej: compras)"
                        onChange={(e) => setNuevaLista(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && nuevaLista.trim()) {
                            void sobreLista({ accion: 'agregar', lista: nuevaLista.trim(), items: [] }).then(() => setNuevaLista(''))
                          }
                        }}
                      />
                      <button
                        className="pn-btn primario"
                        onClick={() => nuevaLista.trim() && void sobreLista({ accion: 'agregar', lista: nuevaLista.trim(), items: [] }).then(() => setNuevaLista(''))}
                      >
                        Crear lista
                      </button>
                    </div>
                  </div>
                  {listas.length === 0 && (
                    <div className="pn-tarjeta">
                      <p className="pn-ayuda">Todavía no hay listas. Creá una acá o decile a Nooby «agregá leche a la lista de compras».</p>
                    </div>
                  )}
                  {listas.map((l) => (
                    <div key={l.nombre} className="pn-tarjeta">
                      <h3>
                        {l.nombre} <small className="pn-ayuda">({l.items.filter((i) => !i.hecho).length} pendientes)</small>
                      </h3>
                      <div className="pn-bit-lista">
                        {l.items.length === 0 && <p className="pn-ayuda">Vacía.</p>}
                        {l.items.map((i) => (
                          <div key={i.id} className="pn-item" data-hecho={i.hecho ? 'si' : undefined}>
                            <label className="pn-item-check">
                              <input type="checkbox" checked={i.hecho} onChange={() => void sobreLista({ accion: 'marcar', lista: l.nombre, item: String(i.n), hecho: !i.hecho })} />
                              <span>{i.texto}</span>
                            </label>
                            <button className="pn-ficha" title="Sacar" onClick={() => void sobreLista({ accion: 'quitar', lista: l.nombre, item: String(i.n) })}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="pn-fila pn-busca">
                        <input
                          className="pn-input"
                          value={nuevoItem[l.nombre] ?? ''}
                          maxLength={120}
                          placeholder="Agregar a esta lista…"
                          onChange={(e) => setNuevoItem({ ...nuevoItem, [l.nombre]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (nuevoItem[l.nombre] ?? '').trim()) {
                              void sobreLista({ accion: 'agregar', lista: l.nombre, items: [nuevoItem[l.nombre]] }).then(() => setNuevoItem({ ...nuevoItem, [l.nombre]: '' }))
                            }
                          }}
                        />
                        <button
                          className="pn-btn primario"
                          onClick={() =>
                            (nuevoItem[l.nombre] ?? '').trim() &&
                            void sobreLista({ accion: 'agregar', lista: l.nombre, items: [nuevoItem[l.nombre]] }).then(() => setNuevoItem({ ...nuevoItem, [l.nombre]: '' }))
                          }
                        >
                          Agregar
                        </button>
                      </div>
                      <div className="pn-fila">
                        <button className="pn-btn secundario" onClick={() => void sobreLista({ accion: 'reordenar', lista: l.nombre, orden: 'invertir' })}>
                          ⇅ Dar vuelta
                        </button>
                        <button className="pn-btn secundario" onClick={() => void sobreLista({ accion: 'limpiar_hechos', lista: l.nombre })}>
                          Sacar los tachados
                        </button>
                        <button
                          className="pn-btn peligro"
                          onClick={() => window.confirm('¿Borrar la lista ' + l.nombre + '?') && void sobreLista({ accion: 'borrar', lista: l.nombre })}
                        >
                          Borrar lista
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {seccion === 'bitacora' && (
            <>
              <h2 className="pn-titulo">Bitácora y memoria</h2>
              {local ? (
                <>
                  <div className="pn-tarjeta">
                    <p>
                      Todo lo que hablás con Nooby (después de despertarlo) queda guardado acá, en la PC, un archivo por día en{' '}
                      <code>~/.nooby/bitacora</code>. Por voz: «anotá en la bitácora que…», «no guardes esto» (modo privado), «borrá lo último», y
                      preguntale «qué hablamos ayer» o «resumime la semana».
                    </p>
                    {notaBit && <p className="pn-nota">{notaBit}</p>}
                  </div>

                  <div className="pn-tarjeta">
                    <h3>Buscar</h3>
                    <div className="pn-fila pn-busca">
                      <input
                        className="pn-input"
                        value={busqueda}
                        placeholder="ej: H2C, soporte, Juan…"
                        onChange={(e) => setBusqueda(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void buscarEnBitacora()}
                      />
                      <button className="pn-btn secundario" onClick={() => void buscarEnBitacora()}>
                        Buscar
                      </button>
                    </div>
                    {resultadosBit && (
                      <div className="pn-bit-lista">
                        {resultadosBit.length === 0 && <p className="pn-ayuda">No encontré nada.</p>}
                        {resultadosBit.map((r, i) => (
                          <button key={i} className="pn-bit-fila" onClick={() => (setResultadosBit(null), void cargarBitacora(r.dia))}>
                            <small>
                              {r.dia} {r.hora}
                            </small>
                            <span>{r.texto}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pn-tarjeta">
                    <h3>Días</h3>
                    {diasBit.length === 0 ? (
                      <p className="pn-ayuda">Todavía no hay nada guardado. Despertá a Nooby y charlá un rato.</p>
                    ) : (
                      <div className="pn-fichas">
                        {diasBit.map((d) => (
                          <button
                            key={d.dia}
                            className="pn-ficha"
                            aria-pressed={diaSel === d.dia}
                            onClick={() => void cargarBitacora(d.dia)}
                          >
                            {d.dia} · {d.entradas}
                          </button>
                        ))}
                      </div>
                    )}
                    {diaSel && (
                      <>
                        <div className="pn-bit-lista">
                          {entradasBit.map((e, i) => (
                            <div key={i} className="pn-bit-entrada" data-rol={e.rol}>
                              <small>{e.hora}</small>
                              <b>{e.rol === 'nota' ? '📝 Nota' : e.rol === 'nooby' ? 'Nooby' : e.quien || 'Yo'}</b>
                              <span>{e.texto}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pn-fila">
                          <a className="pn-btn secundario" href={`/api/bitacora?dia=${encodeURIComponent(diaSel)}&formato=md`} download>
                            ⬇ Descargar (.md)
                          </a>
                          <button className="pn-btn peligro" onClick={() => void borrarDia(diaSel)}>
                            Borrar este día
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="pn-tarjeta">
                    <h3>Memoria de Nooby</h3>
                    <p className="pn-ayuda">
                      Datos que Nooby recuerda siempre ("acordate de que mi hermano se llama Pablo"). Se los podés pedir por voz o cargarlos acá.
                    </p>
                    {datosMem.length === 0 ? (
                      <p className="pn-ayuda">No recuerda nada todavía.</p>
                    ) : (
                      <div className="pn-fichas">
                        {datosMem.map((m) => (
                          <button key={m.id} className="pn-ficha" onClick={() => void sacarDato(m.id)} title="Olvidar">
                            {m.texto} ✕
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="pn-fila pn-busca">
                      <input
                        className="pn-input"
                        value={nuevoDato}
                        maxLength={300}
                        placeholder="Algo para que recuerde…"
                        onChange={(e) => setNuevoDato(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void sumarDato()}
                      />
                      <button className="pn-btn primario" onClick={() => void sumarDato()}>
                        Agregar
                      </button>
                    </div>
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
