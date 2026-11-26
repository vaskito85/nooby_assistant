import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Cara, type Humor } from './Cara'
import { ImpresoraAnimada } from './ImpresoraAnimada'
import { PanelImpresora } from './PanelImpresora'
import { Pensamiento } from './Pensamiento'
import { pcActivo, type ActividadPc } from './lib/actividad'
import { describirImpresoras, inferirEstado, type EstadoImpresora, type InformeImpresoras } from './lib/impresoras'
import { comentarioPorMovimiento, FRASE_HOLA_DE_NUEVO, FRASE_YA_TE_VAS } from './lib/comentarios'
import { Mirada } from './lib/mirada'
import { detectarLlamado, esConfirmacion, interpretar, type Orden } from './lib/voz'
import { callar, desbloquear, hablar, sonar, type Sonido } from './lib/audio'
import { frase, pedirClima } from './lib/clima'
import { aplicarRemota, cargarAjustes, guardarAjustes, limpiarLlamadas, temaConfig, type Ajustes } from './lib/config'
import { conectarLocal, estadoLocal, guardarConfigLocal, leerImpresoras } from './lib/canalLocal'
import { conectarNtfy } from './lib/ntfy'
import { Presencia } from './lib/presencia'
import { Sentado } from './lib/sentado'

declare global {
  interface Window {
    /** Contadores internos del detector, para depurar desde chrome://inspect. */
    __noobyDebug?: Record<string, unknown>
  }
}

const MIN = 60_000
const AVISO_IMPRESORA_MS = 5 * MIN // el aviso de la impresora queda en pantalla hasta el OK o hasta este tiempo
const INTENTOS_ENTRENAMIENTO = 5 // cuántas veces repite la frase al entrenar
const ENTRENAMIENTO_MAX_MS = 120_000 // si nadie dice nada, se cancela solo
// Mientras no hay nada entrenado, el reconocedor espera estas (el modelo no conoce "nooby": son lo más parecido que sabe).
const GRAMATICA_DEFECTO = ['che nube', 'che nubes', 'che nuevo', 'nube', 'nubes']
const PERIODO_CAMARA_MS = 120 // ~8 lecturas por segundo: los ojos siguen en tiempo real
const PENSAMIENTO_CADA_MS = 60_000
const PENSAMIENTO_DURA_MS = 5000

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
  /** Solo avisos de la impresora: qué dibujo mostrar. */
  estado?: EstadoImpresora
  impresora?: string
}

function minutos(ms: number) {
  return Math.floor(ms / MIN)
}

export function App() {
  const [ajustes, setAjustes] = useState<Ajustes>(cargarAjustes)
  const [fase, setFase] = useState<'inicio' | 'activo'>('inicio')
  const [presente, setPresente] = useState(false)
  const [conCamara, setConCamara] = useState(false)
  const [sentadoMin, setSentadoMin] = useState(0) // solo minutos enteros: no re-renderiza 8 veces por segundo
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [hablando, setHablando] = useState(false)
  const [saludo, setSaludo] = useState(false)
  const [mimo, setMimo] = useState(false)
  const [enojado, setEnojado] = useState(false)
  const [ausenteLargo, setAusenteLargo] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [informe, setInforme] = useState<InformeImpresoras>({ ts: null, impresoras: [] })
  // Oído: 'sin' = no disponible (navegador común); 'listo' = esperando "che nooby"; 'atento' = ya respondió y escucha el pedido
  const [oido, setOido] = useState<'sin' | 'listo' | 'atento'>('sin')
  const [oyo, setOyo] = useState('')
  // Entrenamiento de la frase de despertar (lo pide el panel de la PC): el celu te la hace repetir y anota cómo la entiende.
  const [entrenando, setEntrenando] = useState<{ frase: string; intentos: string[]; resultado?: string[] } | null>(null)
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
  const timerCierreAviso = useRef<number | null>(null)
  const presenteAntes = useRef(false)
  const ultimaVista = useRef(0)
  const visibleAntes = useRef(false)
  const toques = useRef<number[]>([])
  const oidoRef = useRef(oido)
  oidoRef.current = oido
  const avisoRef = useRef<Aviso | null>(null)
  avisoRef.current = aviso
  const ultimoYaTeVas = useRef(0)
  const alOirRef = useRef<(d: { text?: string; partial?: string }) => void>(() => {})
  const timerAtento = useRef<number | null>(null)
  const entrenandoRef = useRef(entrenando)
  entrenandoRef.current = entrenando
  const timerEntrenar = useRef<number | null>(null)
  const actividadPcRef = useRef<ActividadPc | null>(null)
  const iniciarEntrenamientoRef = useRef<(frase: string) => void>(() => {})
  const mirada = useRef<Mirada | null>(null)
  const dedoActivo = useRef(false)
  const timerDedo = useRef<number | null>(null)
  const timerPensando = useRef<number | null>(null)
  const enlaceAntes = useRef<boolean | null>(null)
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
    (
      texto: string,
      sonido: Sonido,
      insistir: boolean,
      opciones: { cerrarEn?: number; forzarVoz?: boolean; estado?: EstadoImpresora; impresora?: string } = {},
    ) => {
      cortarAlarma()
      setAviso({ texto, sonido, estado: opciones.estado, impresora: opciones.impresora })
      const habla = opciones.forzarVoz || ajustesRef.current.voz
      // Solo la alarma de la impresión suena como alarma. Todo lo demás se dice en voz alta, sin "ding" antes;
      // si la voz está apagada, suena la campanita para que el aviso no pase en silencio.
      if (sonido === 'alarma' || !habla) sonar(sonido)
      if (habla) {
        setHablando(true)
        hablar(texto)
        // La boca se mueve mientras habla: en el APK el fin lo avisa el motor de voz; si no, se estima por el largo del texto.
        window.setTimeout(() => setHablando(false), Math.max(2500, texto.length * 75))
      }
      // La alarma de la impresora se queda hasta que digas OK o pasen 5 minutos; lo demás se cierra solo antes.
      if (timerCierreAviso.current) window.clearTimeout(timerCierreAviso.current)
      const cierre = opciones.cerrarEn ?? (sonido === 'alarma' ? AVISO_IMPRESORA_MS : undefined)
      if (cierre) {
        timerCierreAviso.current = window.setTimeout(() => {
          cortarAlarma()
          setAviso((a) => (a?.texto === texto ? null : a))
        }, cierre)
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
    if (timerCierreAviso.current) window.clearTimeout(timerCierreAviso.current)
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

  // Mira la cámara ~8 veces por segundo: presencia, contadores y hacia dónde miran los ojos.
  useEffect(() => {
    if (fase !== 'activo' || !conCamara) return
    const dbg = (window.__noobyDebug = { ciclos: 0, cuadros: 0, conCara: 0, msInferencia: 0, ultimaCara: 0, pcActiva: 0, idlePcMs: -1 })
    let proximaLectura = 0
    const id = window.setInterval(() => {
      const ahora = Date.now()
      // Si el celu va lento (cada lectura tarda mucho), se espera el doble de lo que tardó: la cámara no puede
      // comerse todo el procesador y dejar sin aire a la pantalla y al oído.
      if (ahora < proximaLectura) return
      const t0 = performance.now()
      const cara = presencia.current?.buscarCara()
      dbg.ciclos++
      if (cara !== undefined) {
        dbg.cuadros++
        dbg.msInferencia = Math.round(performance.now() - t0)
        proximaLectura = ahora + Math.min(1000, dbg.msInferencia * 2)
        visibleAntes.current = cara !== null
        if (cara) {
          dbg.conCara++
          dbg.ultimaCara = ahora
        }
        // El dedo manda un rato; si no, los ojos siguen la cara (o vuelven al centro).
        if (!dedoActivo.current) {
          if (cara) mirada.current?.apuntar(cara.x, cara.y)
          else mirada.current?.descansar()
        }
      }
      // Estás si te ve la cámara O si estás usando la PC (teclado/mouse): sentado frente a la compu no mirás el celu.
      const pcUsandose = pcActivo(actividadPcRef.current, ahora)
      dbg.pcActiva = pcUsandose ? 1 : 0 // para diagnosticar desde chrome://inspect
      dbg.idlePcMs = actividadPcRef.current?.idleMs ?? -1
      const visible = visibleAntes.current || pcUsandose
      const vistaAnterior = ultimaVista.current // la última vez que te vio ANTES de este cuadro
      if (visible) ultimaVista.current = ahora
      const s = sentado.current.tick(ahora, visible)
      const a = agua.current.tick(ahora, visible)

      if (s.presente && !presenteAntes.current && ultimaVista.current && ahora - ultimaVista.current < 1000) {
        setSaludo(true)
        window.setTimeout(() => setSaludo(false), 3000)
      }

      // Comentarios al irte y al volver. No pisan una alarma de la impresión que esté sonando.
      if (avisoRef.current?.sonido !== 'alarma') {
        const c = comentarioPorMovimiento({
          estabaPresente: presenteAntes.current,
          estaPresente: s.presente,
          sentadoMs: s.sentadoMs,
          ahora,
          vistaAnterior,
          ultimoYaTeVas: ultimoYaTeVas.current,
        })
        if (c === 'yaTeVas') {
          ultimoYaTeVas.current = ahora
          lanzarAviso(FRASE_YA_TE_VAS, 'suave', false, { cerrarEn: 8000 })
        } else if (c === 'holaDeNuevo') {
          lanzarAviso(FRASE_HOLA_DE_NUEVO, 'suave', false, { cerrarEn: 10_000 })
        }
      }
      presenteAntes.current = s.presente
      setPresente(s.presente)
      setSentadoMin(minutos(s.sentadoMs))
      setAusenteLargo(!s.presente && ultimaVista.current > 0 && ahora - ultimaVista.current > 30_000)

      if (s.avisar) {
        lanzarAviso(`Llevás ${minutos(s.sentadoMs)} minutos sentado. Levantate un ratito.`, 'suave', false)
      } else if (a.avisar && ajustesRef.current.aguaMin > 0) {
        lanzarAviso('Che, tomá un poco de agua.', 'suave', false)
      }
    }, PERIODO_CAMARA_MS)
    return () => window.clearInterval(id)
  }, [fase, conCamara, lanzarAviso])

  // Los ojos se mueven fuera de React: un objeto que los anima cuadro a cuadro.
  useEffect(() => {
    const m = new Mirada(document.documentElement)
    mirada.current = m
    return () => m.detener()
  }, [])

  // Globito pensador: cada tanto muestra el estado de la conexión con la PC (✓ o ✗).
  const mostrarPensamiento = useCallback(() => {
    setPensando(true)
    if (timerPensando.current) window.clearTimeout(timerPensando.current)
    timerPensando.current = window.setTimeout(() => setPensando(false), PENSAMIENTO_DURA_MS)
  }, [])
  useEffect(() => {
    if (fase !== 'activo') return
    const primero = window.setTimeout(mostrarPensamiento, 6000)
    const id = window.setInterval(mostrarPensamiento, PENSAMIENTO_CADA_MS)
    return () => {
      window.clearTimeout(primero)
      window.clearInterval(id)
    }
  }, [fase, mostrarPensamiento])
  useEffect(() => {
    // Si la conexión cambia (se cae o vuelve) lo cuenta en el momento.
    if (ntfyOk !== null && enlaceAntes.current !== null && ntfyOk !== enlaceAntes.current) mostrarPensamiento()
    if (ntfyOk !== null) enlaceAntes.current = ntfyOk
  }, [ntfyOk, mostrarPensamiento])

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
    // Si la conexión con la PC se corta y vuelve (p. ej. se actualizó el servidor), se recarga la página
    // para tomar la versión nueva de la web.
    let huboCorte = false
    const estadoEnlace = (ok: boolean) => {
      setNtfyOk(ok)
      if (!ok) huboCorte = true
      else if (huboCorte) location.reload()
    }
    return conectarLocal({
      alAviso: (a) => {
        // Aviso de la impresora: la cara pasa a ser una impresora y la info queda al costado hasta el OK o 5 minutos.
        lanzarAviso(a.texto, 'alarma', true, { estado: a.estado, impresora: a.impresora })
        void leerImpresoras()
          .then(setInforme)
          .catch(() => {})
      },
      alConfig: (cfg) => {
        const nuevo = aplicarRemota(ajustesRef.current, cfg)
        guardarAjustes(nuevo)
        setAjustes(nuevo)
      },
      alEstado: estadoEnlace,
      alEntrenar: (frase) => iniciarEntrenamientoRef.current(frase),
      alActividad: (idleMs) => {
        actividadPcRef.current = { idleMs, en: Date.now() }
      },
      alImpresoras: setInforme,
    })
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

  const verClima = async (opciones: { cerrarEn?: number; forzarVoz?: boolean } = {}) => {
    const { lat, lon, ciudad } = ajustesRef.current
    setNota('Mirando el cielo…')
    try {
      const c = await pedirClima(lat, lon)
      setNota('')
      lanzarAviso(frase(c, ciudad), 'suave', false, opciones)
    } catch (e) {
      const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setNota(`No pude traer el clima (${detalle}).`)
    }
  }

  // ---------- voz: "che nooby" + pedidos ----------
  const mantenerAtento = (ms = 10_000) => {
    if (timerAtento.current) window.clearTimeout(timerAtento.current)
    timerAtento.current = window.setTimeout(() => {
      setOido((o) => (o === 'atento' ? 'listo' : o))
      setOyo('')
    }, ms)
  }

  const responder = (texto: string) => lanzarAviso(texto, 'suave', false, { cerrarEn: 12_000, forzarVoz: true })

  const ejecutar = (orden: Orden) => {
    const { nombre } = ajustesRef.current
    const ahora = new Date()
    switch (orden) {
      case 'clima':
        void verClima({ cerrarEn: 15_000, forzarVoz: true })
        break
      case 'hora': {
        const h = ahora.getHours()
        const m = ahora.getMinutes()
        responder(m === 0 ? `Son las ${h} en punto.` : `Son las ${h} y ${m}.`)
        break
      }
      case 'tiempoSentado':
        responder(
          sentado.current.sentadoMs > 0
            ? `Llevás ${minutos(sentado.current.sentadoMs)} minutos sentado, ${nombre}.`
            : 'No te veo sentado ahora.',
        )
        break
      case 'levante':
        sentado.current.descansar()
        agua.current.descansar()
        setSentadoMin(0)
        responder('Perfecto, contador en cero.')
        break
      case 'agua':
        agua.current.descansar()
        responder(`Muy bien, ${nombre}. Hay que tomar agua.`)
        break
      case 'impresoras':
        void leerImpresoras()
          .then((d) => responder(describirImpresoras(d, Date.now())))
          .catch(() => responder('No pude consultar las impresoras.'))
        break
      case 'chau':
        responder('De nada.')
        break
      case 'ayuda':
        responder('Podés pedirme el clima, la hora, cómo van las impresoras, cuánto llevás sentado, o decirme que ya te levantaste o tomaste agua.')
        break
    }
  }

  const despertar = () => {
    setOido('atento')
    lanzarAviso(`Sí, ${ajustesRef.current.nombre}`, 'suave', false, { cerrarEn: 6000, forzarVoz: true })
    mantenerAtento(12_000)
  }

  const atender = (texto: string) => {
    const orden = interpretar(texto)
    if (!orden) {
      responder('No te entendí. Probá con el clima o la hora.')
      mantenerAtento()
      return
    }
    ejecutar(orden)
    if (orden === 'chau') {
      if (timerAtento.current) window.clearTimeout(timerAtento.current)
      setOido('listo')
      setOyo('')
    } else {
      mantenerAtento()
    }
  }

  // ---------- entrenar la frase de despertar con tu voz ----------
  const cancelarEntrenamiento = () => {
    if (timerEntrenar.current) window.clearTimeout(timerEntrenar.current)
    setEntrenando(null)
  }

  const iniciarEntrenamiento = (frase: string) => {
    if (typeof window.NoobyNativo?.modoOido !== 'function') {
      setNota('Para entrenar hace falta la app del celu (APK) más nueva.')
      return
    }
    if (timerAtento.current) window.clearTimeout(timerAtento.current)
    setOido('listo')
    setEntrenando({ frase, intentos: [] })
    lanzarAviso(
      `Vamos a enseñarme a despertar. Decí ${frase}, ${INTENTOS_ENTRENAMIENTO} veces, con una pausa entre cada una.`,
      'suave',
      false,
      { cerrarEn: 9000, forzarVoz: true },
    )
    if (timerEntrenar.current) window.clearTimeout(timerEntrenar.current)
    timerEntrenar.current = window.setTimeout(() => setEntrenando(null), ENTRENAMIENTO_MAX_MS)
  }
  iniciarEntrenamientoRef.current = iniciarEntrenamiento

  const terminarEntrenamiento = (frase: string, intentos: string[]) => {
    // Variantes distintas, las más repetidas primero (máximo 8): son cómo entiende el reconocedor TU forma de decirla.
    const cuenta = new Map<string, number>()
    for (const i of intentos) cuenta.set(i, (cuenta.get(i) ?? 0) + 1)
    const variantes = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v]) => v)
    const llamadas = limpiarLlamadas([...ajustesRef.current.llamadas, ...variantes])
    const nuevo = { ...ajustesRef.current, llamadas }
    guardarAjustes(nuevo)
    setAjustes(nuevo)
    void guardarConfigLocal({ llamadas }).catch(() => setNota('No pude guardar el entrenamiento en la PC.'))
    setEntrenando({ frase, intentos, resultado: variantes })
    // Se dice en voz alta pero sin burbuja: abajo queda la lista de lo que entendió.
    hablar('Listo, ya aprendí tu frase.')
    setHablando(true)
    window.setTimeout(() => setHablando(false), 2500)
    if (timerEntrenar.current) window.clearTimeout(timerEntrenar.current)
    timerEntrenar.current = window.setTimeout(() => setEntrenando(null), 9000)
  }

  const registrarIntento = (texto: string) => {
    const e = entrenandoRef.current
    if (!e || e.resultado) return
    const limpio = texto.toLowerCase().replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim()
    // Solo frases cortas y de letras: lo demás es ruido o charla de fondo.
    if (!limpio || limpio.split(' ').length > 5 || !/^[a-záéíóúüñ ]+$/.test(limpio)) return
    const intentos = [...e.intentos, limpio]
    if (intentos.length >= INTENTOS_ENTRENAMIENTO) terminarEntrenamiento(e.frase, intentos)
    else setEntrenando({ ...e, intentos })
  }

  // Lo que oye el celu llega como texto (el APK solo hace de micrófono): acá se decide qué hacer.
  alOirRef.current = (d) => {
    const final = typeof d?.text === 'string'
    const texto = (final ? d.text : d?.partial) ?? ''
    if (!texto) return
    const dbg = window.__noobyDebug ?? (window.__noobyDebug = {})
    const previos = (dbg.oido as string[] | undefined) ?? []
    if (final) dbg.oido = [...previos, texto].slice(-15) // para ver cómo entiende "che nooby" y ajustar
    // Mientras suena el aviso de la impresora, lo único que importa es el "OK".
    if (avisoRef.current?.sonido === 'alarma') {
      if (final && esConfirmacion(texto)) entendido()
      return
    }
    if (entrenandoRef.current) {
      if (final) registrarIntento(texto)
      return
    }
    if (oidoRef.current === 'atento') {
      setOyo(texto)
      mantenerAtento() // mientras habla, no se duerme
    }
    if (!final) return
    const llamado = detectarLlamado(texto, {
      gramatica: typeof window.NoobyNativo?.modoOido === 'function',
      variantes: ajustesRef.current.llamadas,
    })
    if (oidoRef.current === 'listo') {
      if (!llamado.llamado) return
      if (interpretar(llamado.resto)) {
        setOido('atento')
        atender(llamado.resto) // "che nooby, qué hora es" todo junto: responde directo
      } else {
        despertar()
      }
    } else if (oidoRef.current === 'atento') {
      if (llamado.llamado && !interpretar(llamado.resto)) despertar()
      else atender(llamado.llamado ? llamado.resto : texto)
    }
  }

  // Esperando "che nooby" el celu escucha con gramática cerrada (barato y preciso); atento, con vocabulario libre.
  const entrenandoActivo = entrenando !== null
  const alarmaActiva = aviso?.sonido === 'alarma' // con la alarma sonando se escucha en modo libre, para entender el "OK"
  const llamadasClave = ajustes.llamadas.join('|')
  useEffect(() => {
    // Esperando el llamado, el reconocedor solo puede oír tus frases entrenadas (o las de defecto si no entrenaste ninguna).
    const frases = ajustesRef.current.llamadas.length > 0 ? ajustesRef.current.llamadas : GRAMATICA_DEFECTO
    const gramatica = JSON.stringify([...frases, '[unk]'])
    try {
      window.NoobyNativo?.modoOido?.(oido === 'atento' || entrenandoActivo || alarmaActiva ? 'libre' : 'llamado', gramatica)
    } catch {
      /* APK viejo: su modoOido solo recibe el modo */
    }
  }, [oido, entrenandoActivo, alarmaActiva, llamadasClave])

  useEffect(() => {
    const alOyo = (e: Event) => alOirRef.current((e as CustomEvent).detail)
    const alListo = () => setOido((o) => (o === 'sin' ? 'listo' : o))
    const alError = (e: Event) => setNota(`Sin oído: ${String((e as CustomEvent).detail)}`)
    const alFinHabla = () => {
      setHablando(false)
      if (oidoRef.current === 'atento') mantenerAtento() // la cuenta de espera arranca cuando termina de hablar
    }
    window.addEventListener('nooby-oyo', alOyo)
    window.addEventListener('nooby-oido-listo', alListo)
    window.addEventListener('nooby-oido-error', alError)
    window.addEventListener('nooby-hablo-fin', alFinHabla)
    return () => {
      window.removeEventListener('nooby-oyo', alOyo)
      window.removeEventListener('nooby-oido-listo', alListo)
      window.removeEventListener('nooby-oido-error', alError)
      window.removeEventListener('nooby-hablo-fin', alFinHabla)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toques sobre la cara: hasta 3 seguidos le dan gracia; el 4º en 5 s la enoja.
  const alTocarCara = () => {
    const ahora = Date.now()
    toques.current = [...toques.current.filter((t) => ahora - t < VENTANA_TOQUES_MS), ahora]
    if (toques.current.length > TOQUES_PARA_ENOJARSE) {
      toques.current = []
      setEnojado(true)
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
    dedoActivo.current = true
    mirada.current?.apuntar((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2)
    if (timerDedo.current) window.clearTimeout(timerDedo.current)
    timerDedo.current = window.setTimeout(() => {
      dedoActivo.current = false
      mirada.current?.descansar() // si hay cámara, en el próximo cuadro vuelven a seguir la cara
    }, 1500)
  }

  const humor: Humor =
    aviso?.sonido === 'alarma'
      ? 'alerta'
      : enojado
        ? 'enojado'
        : hablando
          ? 'hablando'
          : oido === 'atento' || entrenandoActivo
            ? 'atento'
            : mimo || saludo
              ? 'feliz'
              : conCamara && ausenteLargo
                ? 'dormido'
                : 'normal'

  const enlaceOk = ntfyOk === true
  const estadoAviso: EstadoImpresora = aviso?.estado ?? inferirEstado(aviso?.texto ?? '')

  return (
    <main className="app pantalla" onPointerDown={seguirDedo}>
      <video ref={videoRef} className="video-oculto" playsInline muted />

      {fase === 'inicio' ? (
        <button className="inicio" onClick={empezar}>
          <Cara humor="normal" />
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
          {/* Un lado: la cara, siempre en el mismo lugar y del mismo tamaño. */}
          <section className="lado-cara">
            {aviso?.sonido === 'alarma' ? (
              // Aviso de la impresora: en el lugar de la cara, una impresora (mismo tamaño: nada se corre).
              <ImpresoraAnimada estado={estadoAviso} />
            ) : (
              <>
                <Cara humor={humor} alTocar={alTocarCara} />
                <Pensamiento visible={pensando} ok={enlaceOk} />
              </>
            )}
          </section>

          {/* El otro lado: zonas fijas, así nada se corre cuando cambia el contenido. */}
          <section className="lado-info">
            <p className="zona-estado">
              {!conCamara
                ? 'Sin cámara'
                : presente
                  ? `Sentado hace ${sentadoMin} min`
                  : ausenteLargo
                    ? 'Descansando…'
                    : 'Mirando…'}
            </p>

            <div className="zona-mensaje">
              {aviso?.sonido === 'alarma' ? (
                <PanelImpresora texto={aviso.texto} estado={estadoAviso} informe={informe} alOk={entendido} />
              ) : aviso ? (
                <div className={`burbuja ${aviso.sonido}`} role="alert">
                  <p>{aviso.texto}</p>
                  <button className={`boton grande ${aviso.sonido}`} onClick={entendido}>
                    Entendido
                  </button>
                </div>
              ) : entrenando ? (
                <div className="nota escuchando">
                  {entrenando.resultado ? (
                    <>
                      <span>¡Listo! Aprendí tu frase.</span>
                      <span className="oyo">Te entendí: {entrenando.resultado.map((r) => `«${r}»`).join(' ')}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        Decí «{entrenando.frase}» ({Math.min(entrenando.intentos.length + 1, INTENTOS_ENTRENAMIENTO)} de{' '}
                        {INTENTOS_ENTRENAMIENTO})
                      </span>
                      {entrenando.intentos.length > 0 && (
                        <span className="oyo">Te entendí: «{entrenando.intentos[entrenando.intentos.length - 1]}»</span>
                      )}
                      <button className="boton" onClick={cancelarEntrenamiento}>
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              ) : oido === 'atento' ? (
                <p className="nota escuchando">
                  Escuchando…
                  {oyo && <span className="oyo">«{oyo}»</span>}
                </p>
              ) : (
                nota && <p className="nota">{nota}</p>
              )}
            </div>

            <nav className="botones">
              <button className="boton" onClick={() => verClima()}>
                ☁ Clima
              </button>
              <button
                className="boton"
                onClick={() => {
                  sentado.current.descansar()
                  agua.current.descansar()
                  setSentadoMin(0)
                  setNota('Contador en cero.')
                }}
              >
                ↺ Ya me levanté
              </button>
            </nav>
          </section>
        </>
      )}
    </main>
  )
}
