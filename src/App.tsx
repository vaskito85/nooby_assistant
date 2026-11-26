import { useCallback, useEffect, useRef, useState } from 'react'
import { Cara, type Humor } from './Cara'
import { desbloquear, hablar, sonar, type Sonido } from './lib/audio'
import { frase, pedirClima } from './lib/clima'
import { cargarAjustes, guardarAjustes, type Ajustes } from './lib/config'
import { conectarNtfy, enviarNtfy } from './lib/ntfy'
import { Presencia } from './lib/presencia'
import { Sentado } from './lib/sentado'

const MIN = 60_000

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
  const [ausenteLargo, setAusenteLargo] = useState(false)
  const [ntfyOk, setNtfyOk] = useState<boolean | null>(null)
  const [nota, setNota] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const presencia = useRef<Presencia | null>(null)
  const sentado = useRef(
    new Sentado({ limiteMs: ajustes.sentadoMin * MIN, graciaMs: 10_000, ausenciaResetMs: 5 * MIN, repetirMs: 10 * MIN }),
  )
  const agua = useRef(
    new Sentado({ limiteMs: ajustes.aguaMin * MIN, graciaMs: 10_000, ausenciaResetMs: 15 * MIN, repetirMs: ajustes.aguaMin * MIN }),
  )
  const alarma = useRef<number | null>(null)
  const presenteAntes = useRef(false)
  const ultimaVista = useRef(0)

  // Cambios en los ajustes de tiempos se aplican al contador en marcha.
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
      if (ajustes.voz) {
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
    [ajustes.voz, cortarAlarma],
  )

  const entendido = () => {
    cortarAlarma()
    speechSynthesis?.cancel()
    setAviso(null)
    setHablando(false)
  }

  // Arranque: lo dispara el primer toque (audio, cámara y pantalla encendida piden un gesto).
  const empezar = async () => {
    desbloquear()
    setFase('activo')
    try {
      await navigator.wakeLock?.request('screen')
    } catch {
      /* sin wake lock: el celu puede apagar la pantalla */
    }
    const p = new Presencia()
    try {
      if (!videoRef.current) throw new Error('sin video')
      await p.iniciar(videoRef.current)
      presencia.current = p
      setConCamara(true)
    } catch (e) {
      setConCamara(false)
      setNota(`No pude usar la cámara (${e instanceof Error ? e.message : 'error'}). Funciono solo con avisos.`)
    }
  }

  // Revisa la cámara ~1.4 veces por segundo y actualiza los contadores.
  useEffect(() => {
    if (fase !== 'activo' || !conCamara) return
    const id = window.setInterval(() => {
      const ahora = Date.now()
      const visible = presencia.current?.hayCara() ?? false
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
      } else if (a.avisar && ajustes.aguaMin > 0) {
        lanzarAviso('Che, tomá un poco de agua.', 'suave', false)
      }
    }, 700)
    return () => window.clearInterval(id)
  }, [fase, conCamara, lanzarAviso, ajustes.aguaMin])

  // Avisos que llegan de afuera (la impresión, lo que quieras) por ntfy.
  useEffect(() => {
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
  }, [fase, ajustes.servidor, ajustes.tema, lanzarAviso])

  useEffect(() => () => presencia.current?.detener(), [])

  const verClima = async () => {
    setNota('Mirando el cielo…')
    try {
      const c = await pedirClima(ajustes.lat, ajustes.lon)
      const f = frase(c, ajustes.ciudad)
      setNota('')
      lanzarAviso(f, 'suave', false)
    } catch {
      setNota('No pude traer el clima. ¿Hay internet?')
    }
  }

  const probarAviso = async () => {
    const texto = 'Che, la impresión terminó'
    if (!ajustes.tema) return lanzarAviso(texto, 'alarma', true)
    try {
      await enviarNtfy(ajustes.servidor, ajustes.tema, texto) // vuelve por ntfy y salta solo
      setNota('Prueba enviada: debería sonar en unos segundos.')
    } catch {
      setNota('No pude mandar la prueba a ntfy.')
    }
  }

  const cambiar = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => {
    const nuevo = { ...ajustes, [k]: v }
    setAjustes(nuevo)
    guardarAjustes(nuevo)
  }

  const humor: Humor = aviso?.sonido === 'alarma'
    ? 'alerta'
    : hablando || aviso
      ? 'hablando'
      : saludo
        ? 'feliz'
        : conCamara && ausenteLargo
          ? 'dormido'
          : 'normal'

  return (
    <main className="app">
      <video ref={videoRef} className="video-oculto" playsInline muted />

      {fase === 'inicio' ? (
        <button className="inicio" onClick={empezar}>
          <Cara humor="normal" />
          <span className="inicio-texto">Tocá para despertar a Nooby</span>
          <small>Va a pedir permiso para la cámara. El video no sale del celu.</small>
        </button>
      ) : (
        <>
          <section className="escenario">
            <Cara humor={humor} />
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
            <button className="boton" onClick={verClima}>
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

          <details className="ajustes">
            <summary>Ajustes</summary>
            <label>
              Tema de ntfy (secreto, largo)
              <input
                value={ajustes.tema}
                onChange={(e) => cambiar('tema', e.target.value.trim())}
                placeholder="taller-x7k2q9..."
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
            <label>
              Servidor ntfy
              <input value={ajustes.servidor} onChange={(e) => cambiar('servidor', e.target.value.trim())} />
            </label>
            <label>
              Avisar sentado cada (min)
              <input
                type="number"
                min={1}
                value={ajustes.sentadoMin}
                onChange={(e) => cambiar('sentadoMin', Math.max(1, Number(e.target.value) || 60))}
              />
            </label>
            <label>
              Recordar agua cada (min, 0 = no)
              <input
                type="number"
                min={0}
                value={ajustes.aguaMin}
                onChange={(e) => cambiar('aguaMin', Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label>
              Ciudad (para el clima)
              <input value={ajustes.ciudad} onChange={(e) => cambiar('ciudad', e.target.value)} />
            </label>
            <div className="fila">
              <label>
                Lat
                <input
                  type="number"
                  step="0.01"
                  value={ajustes.lat}
                  onChange={(e) => cambiar('lat', Number(e.target.value))}
                />
              </label>
              <label>
                Lon
                <input
                  type="number"
                  step="0.01"
                  value={ajustes.lon}
                  onChange={(e) => cambiar('lon', Number(e.target.value))}
                />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={ajustes.voz} onChange={(e) => cambiar('voz', e.target.checked)} />
              Hablar en voz alta
            </label>
            <button className="boton" onClick={probarAviso}>
              Probar aviso de impresión
            </button>
            <p className="chico">
              ntfy: {ntfyOk === null ? 'sin tema configurado' : ntfyOk ? 'conectado ✓' : 'sin conexión'}
            </p>
          </details>
        </>
      )}
    </main>
  )
}
