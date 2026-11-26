import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Cara, type Humor, type Mirada } from './Cara'
import { callar, desbloquear, hablar, sonar, type Sonido } from './lib/audio'
import { frase, pedirClima } from './lib/clima'
import { aplicarRemota, cargarAjustes, guardarAjustes, temaConfig, type Ajustes } from './lib/config'
import { conectarLocal, estadoLocal } from './lib/canalLocal'
import { conectarNtfy } from './lib/ntfy'
import { Presencia } from './lib/presencia'
import { Sentado } from './lib/sentado'

const MIN = 60_000
const TOQUES_PARA_ENOJARSE = 3 // al 4º toque seguido se enoja
const VENTANA_TOQUES_MS = 5000
const ENOJO_MS = 6000

const RETOS = [
  '¡Basta! ¡Dejame tranquilo!',
  '¡Eh! ¡No me toques más!',
  '¡Ya está bien! ¡Me vas a gastar la pantalla!',
  '¡Pará, pará! ¡Estoy trabajando!',
]

interface Aviso {
  texto: string
  sonido: Sonido
}

function minutos(ms: number) {
  return Math.floor(ms / MIN)
}

export function App() {
  const [ajustes, setAjustes] = useState<Ajustes>(cargarAjustes)
  const [fase, setFase] = useState<'inicio' | 'activo'>('inicio')
  const [presente, setPresente] = useState(false)
  const [conCamara, setConCamara] = useState(false)
  const [sentadoMs, setSentadoMs] = useState(0)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [hablando, setHablando] = useState(false)
  const [saludo, setSaludo] = useState(false)
  const [mimo, setMimo] = useState(false)
  const [enojado, setEnojado] = useState(false)
  const [ausenteLargo, setAusenteLargo] = useState(false)
  const [miradaCara, setMiradaCara] = useState<Mirada | null>(null)
  const [miradaDedo, setMiradaDedo] = useState<Mirada | null>(null)
  const [ntfyOk, setNtfyOk] = useState<boolean | null>(null)
  const [modo, setModo] = useState<'detectando' | 'local' | 'ntfy'>('detectando')
  const [nota, setNota] = useState('')

  // Los ajustes cambian desde la PC; los timers leen siempre el valor vigente por ref.
  const ajustesRef = useRef(ajustes)
  ajustesRef.current = ajustes

  const videoRef = useRef<HTMLVideoElement>(null)
  const presencia = useRef<Presencia | null>(null)
  const sentado = useRef(
    new Sentado({ limiteMs: ajustes.sentadoMin * MIN, graciaMs: 10_000, ausenciaResetMs: 5 * MIN, repetirMs: 10 * MIN }),
  )
  const agua = useRef(
    new Sentado({ limiteMs: ajustes.aguaMin * MIN, graciaMs: 10_000, ausenciaResetMs: 15 * MIN, repetirMs: Math.max(1, ajustes.aguaMin) * MIN }),
  )
  const alarma = useRef<number | null>(null)
  const presenteAntes = useRef(false)
  const ultimaVista = useRef(0)
  const visibleAntes = useRef(false)
  const toques = useRef<number[]>([])
  const timerDedo = useRef<number | null>(null)
  const timerEnojo = useRef<number | null>(null)

  // Cambios de tiempos (llegan desde el panel) se aplican al contador en marcha.
  useEffect(() => {
    sentado.current.cfg.limiteMs = ajustes.sentadoMin * MIN
    agua.current.cfg.limiteMs = ajustes.aguaMin * MIN
    agua.current.cfg.repetirMs = Math.max(1, ajustes.aguaMin) * MIN
  }, [ajustes.sentadoMin, ajustes.aguaMin])

  const cortarAlarma = useCallback(() => {
    if (alarma.current) window.clearInterval(alarma.current)
    alarma.current = null
  }, [])

  const lanzarAviso = useCallback(
    (texto: string, sonido: Sonido, insistir: boolean) => {
      cortarAlarma()
      setAviso({ texto, sonido })
      sonar(sonido)
      if (ajustesRef.current.voz) {
        setHablando(true)
        hablar(texto)
        window.setTimeout(() => setHablando(false), 2500)
      }
      if (insistir) {
        let veces = 0
        alarma.current = window.setInterval(() => {
          sonar(sonido)
          if (++veces >= 10) cortarAlarma()
        }, 6000)
      }
    },
    [cortarAlarma],
  )

  const entendido = () => {
    cortarAlarma()
    callar()
    setAviso(null)
    setHablando(false)
  }

  // Arranque: lo dispara el primer toque (pantalla completa, audio, cámara y pantalla encendida piden un gesto).
  const empezar = async () => {
    // Lo primero, antes de cualquier await: el navegador solo la concede dentro del gesto.
    void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
    desbloquear()
    setFase('activo')
    try {
      await navigator.wakeLock?.request('screen')
    } catch {
      /* sin wake lock: el celu puede apagar la pantalla */
    }
    void iniciarCamara()
  }

  // En el APK el permiso de cámara se pide en el momento: si todavía no lo contestaste, reintenta.
  const iniciarCamara = async (intento = 1) => {
    const p = new Presencia()
    try {
      if (!videoRef.current) throw new Error('sin video')
      await p.iniciar(videoRef.current)
      presencia.current = p
      setConCamara(true)
      setNota('')
    } catch (e) {
      p.detener()
      setConCamara(false)
      const motivo = e instanceof Error ? `${e.name}: ${e.message}` : 'error'
      if (intento < 8) {
        setNota(`Esperando el permiso de la cámara… (${intento}/8)`)
        window.setTimeout(() => void iniciarCamara(intento + 1), 4000)
      } else {
        setNota(
          `No pude usar la cámara (${motivo}). Dale permiso a Nooby en Ajustes del celu > Aplicaciones > Nooby > Permisos. Mientras, funciono solo con avisos.`,
        )
      }
    }
  }

  // El APK avisa si ningún motor de voz del celu pudo hablar en español.
  useEffect(() => {
    const sinVoz = () =>
      setNota(
        'No tengo voz en español. En el celu: Ajustes > Administración general > Idioma > Texto a voz, y descargá el español.',
      )
    window.addEventListener('nooby-voz-error', sinVoz)
    return () => window.removeEventListener('nooby-voz-error', sinVoz)
  }, [])

  // El navegador suelta la pantalla encendida al ocultarse la página: se vuelve a pedir.
  useEffect(() => {
    if (fase !== 'activo') return
    const volver = () => {
      if (document.visibilityState === 'visible') void navigator.wakeLock?.request('screen').catch(() => {})
    }
    document.addEventListener('visibilitychange', volver)
    return () => document.removeEventListener('visibilitychange', volver)
  }, [fase])

  // Mira la cámara ~2 veces por segundo: presencia, contadores y hacia dónde mirar.
  useEffect(() => {
    if (fase !== 'activo' || !conCamara) return
    const id = window.setInterval(() => {
      const ahora = Date.now()
      const cara = presencia.current?.buscarCara()
      if (cara !== undefined) {
        visibleAntes.current = cara !== null
        if (cara) {
          // Suaviza para que los ojos no tiemblen.
          setMiradaCara((m) => (m ? { x: m.x * 0.5 + cara.x * 0.5, y: m.y * 0.5 + cara.y * 0.5 } : cara))
        } else {
          setMiradaCara(null)
        }
      }
      const visible = visibleAntes.current
      if (visible) ultimaVista.current = ahora
      const s = sentado.current.tick(ahora, visible)
      const a = agua.current.tick(ahora, visible)

      if (s.presente && !presenteAntes.current && ultimaVista.current && ahora - ultimaVista.current < 1000) {
        setSaludo(true)
        window.setTimeout(() => setSaludo(false), 3000)
      }
      presenteAntes.current = s.presente
      setPresente(s.presente)
      setSentadoMs(s.sentadoMs)
      setAusenteLargo(!s.presente && ultimaVista.current > 0 && ahora - ultimaVista.current > 30_000)

      if (s.avisar) {
        lanzarAviso(`Llevás ${minutos(s.sentadoMs)} minutos sentado. Levantate un ratito.`, 'suave', false)
      } else if (a.avisar && ajustesRef.current.aguaMin > 0) {
        lanzarAviso('Che, tomá un poco de agua.', 'suave', false)
      }
    }, 450)
    return () => window.clearInterval(id)
  }, [fase, conCamara, lanzarAviso])

  // ¿Me sirve el servidor de la PC (USB)? Si sí, todo va por ahí; si no (Vercel), por ntfy.
  useEffect(() => {
    let vivo = true
    void estadoLocal().then((e) => vivo && setModo(e ? 'local' : 'ntfy'))
    return () => {
      vivo = false
    }
  }, [])

  // Canal local: avisos y ajustes llegan por el cable desde el servidor de la PC.
  useEffect(() => {
    if (modo !== 'local') return
    return conectarLocal(
      (texto) => lanzarAviso(texto, 'alarma', true),
      (cfg) => {
        const nuevo = aplicarRemota(ajustesRef.current, cfg)
        guardarAjustes(nuevo)
        setAjustes(nuevo)
      },
      setNtfyOk,
    )
  }, [modo, lanzarAviso])

  // Dentro del APK no hay nadie que toque "despertar": arranca solo.
  useEffect(() => {
    if (modo === 'detectando' || fase !== 'inicio') return
    if (/NoobyApp/.test(navigator.userAgent)) void empezar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])

  // Avisos que llegan de afuera (la impresión, lo que quieras) por ntfy.
  useEffect(() => {
    if (modo !== 'ntfy') return
    if (fase !== 'activo' || !ajustes.tema) {
      setNtfyOk(null)
      return
    }
    return conectarNtfy(
      ajustes.servidor,
      ajustes.tema,
      (m) => lanzarAviso(m.mensaje, 'alarma', true),
      setNtfyOk,
    )
  }, [modo, fase, ajustes.servidor, ajustes.tema, lanzarAviso])

  // Ajustes que llegan del panel de la PC por ntfy. Al conectar entrega el último guardado.
  useEffect(() => {
    if (modo !== 'ntfy' || !ajustes.tema) return
    return conectarNtfy(
      ajustes.servidor,
      temaConfig(ajustes.tema),
      (m) => {
        try {
          const nuevo = aplicarRemota(ajustesRef.current, JSON.parse(m.mensaje))
          guardarAjustes(nuevo)
          setAjustes(nuevo)
        } catch {
          /* mensaje que no es una configuración: se ignora */
        }
      },
      () => {},
      true,
    )
  }, [modo, ajustes.servidor, ajustes.tema])

  useEffect(() => () => presencia.current?.detener(), [])

  const verClima = async () => {
    const { lat, lon, ciudad } = ajustesRef.current
    setNota('Mirando el cielo…')
    try {
      const c = await pedirClima(lat, lon)
      setNota('')
      lanzarAviso(frase(c, ciudad), 'suave', false)
    } catch (e) {
      const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setNota(`No pude traer el clima (${detalle}).`)
    }
  }

  // Toques sobre la cara: hasta 3 seguidos le dan gracia; el 4º en 5 s la enoja.
  const alTocarCara = () => {
    const ahora = Date.now()
    toques.current = [...toques.current.filter((t) => ahora - t < VENTANA_TOQUES_MS), ahora]
    if (toques.current.length > TOQUES_PARA_ENOJARSE) {
      toques.current = []
      setEnojado(true)
      sonar('alarma')
      if (ajustesRef.current.voz) hablar(RETOS[Math.floor(Math.random() * RETOS.length)])
      if (timerEnojo.current) window.clearTimeout(timerEnojo.current)
      timerEnojo.current = window.setTimeout(() => setEnojado(false), ENOJO_MS)
    } else {
      setMimo(true)
      window.setTimeout(() => setMimo(false), 700)
    }
  }

  // Los ojos también siguen al dedo un ratito.
  const seguirDedo = (e: PointerEvent) => {
    setMiradaDedo({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    })
    if (timerDedo.current) window.clearTimeout(timerDedo.current)
    timerDedo.current = window.setTimeout(() => setMiradaDedo(null), 1500)
  }

  const humor: Humor =
    aviso?.sonido === 'alarma'
      ? 'alerta'
      : enojado
        ? 'enojado'
        : hablando || aviso
          ? 'hablando'
          : mimo || saludo
            ? 'feliz'
            : conCamara && ausenteLargo
              ? 'dormido'
              : 'normal'

  const mirada = humor === 'dormido' ? null : (miradaDedo ?? miradaCara)

  return (
    <main className="app" onPointerDown={seguirDedo}>
      <video ref={videoRef} className="video-oculto" playsInline muted />

      {fase === 'inicio' ? (
        <button className="inicio" onClick={empezar}>
          <Cara humor="normal" mirada={null} />
          <span className="inicio-texto">Tocá para despertar a Nooby</span>
          {modo === 'local' || ajustes.tema ? (
            <small>Va a pedir permiso para la cámara. El video no sale del celu.</small>
          ) : (
            <small>
              Falta conectarlo: en la PC abrí <strong>/#/panel</strong> y abrí en este celu el link que te da.
            </small>
          )}
        </button>
      ) : (
        <>
          <section className="escenario">
            <Cara humor={humor} mirada={mirada} alTocar={alTocarCara} />
            {aviso ? (
              <div className={`burbuja ${aviso.sonido}`} role="alert">
                <p>{aviso.texto}</p>
                <button className={`boton grande ${aviso.sonido}`} onClick={entendido}>
                  Entendido
                </button>
              </div>
            ) : (
              <p className="estado">
                {!conCamara
                  ? 'Sin cámara'
                  : presente
                    ? `Sentado hace ${minutos(sentadoMs)} min`
                    : ausenteLargo
                      ? 'Descansando…'
                      : 'Mirando…'}
              </p>
            )}
            {nota && <p className="nota">{nota}</p>}
          </section>

          <nav className="botones">
            <button className="boton" onClick={() => verClima()}>
              ☁ Clima
            </button>
            <button
              className="boton"
              onClick={() => {
                sentado.current.descansar()
                agua.current.descansar()
                setSentadoMs(0)
                setNota('Contador en cero.')
              }}
            >
              ↺ Ya me levanté
            </button>
          </nav>

          <p className="chico pie">
            {modo === 'local'
              ? ntfyOk
                ? 'Conectado a la PC ✓'
                : 'Esperando a la PC…'
              : ntfyOk === null
                ? 'Sin tema: falta conectar con la PC'
                : ntfyOk
                  ? 'Conectado ✓'
                  : 'Sin conexión con ntfy'}
          </p>
        </>
      )}
    </main>
  )
}
