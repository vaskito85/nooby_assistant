import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Cara, type Humor } from './Cara'
import { ClimaAnimado } from './ClimaAnimado'
import { VisorFoto } from './VisorFoto'
import { PanelAviso } from './PanelAviso'
import { RelojAnimado } from './RelojAnimado'
import { cuantoFalta } from './lib/fechas'
import { describirMomento, entenderRecordatorio, entenderTemporizador, extraerMomento, minutosHablados, tokenizar } from './lib/tiempo'
import { ImpresoraAnimada } from './ImpresoraAnimada'
import { PanelClima } from './PanelClima'
import { PanelImpresora } from './PanelImpresora'
import { claveImpresora, elegirFoto, type FotoRecibida } from './lib/fotos'
import { Pensamiento } from './Pensamiento'
import { pcActivo, type ActividadPc } from './lib/actividad'
import * as dichos from './lib/respuestas'
import { describirImpresoras, elegirImpresora, INFORME_VIGENTE_MS, inferirEstado, ordenarPorRelevancia, type EstadoImpresora, type Impresora, type InformeImpresoras } from './lib/impresoras'
import { comentarioPorMovimiento, FRASE_HOLA_DE_NUEVO, FRASE_YA_TE_VAS } from './lib/comentarios'
import { Mirada } from './lib/mirada'
import { quitarEco } from './lib/eco'
import { detectarLlamado, esConfirmacion, extraerNota, interpretar, normalizar, type Orden } from './lib/voz'
import { callar, desbloquear, hablar, sonar, type Sonido } from './lib/audio'
import { frase, pedirClima, type Clima } from './lib/clima'
import { escenaClima } from './lib/escenas'
import { aplicarRemota, cargarAjustes, guardarAjustes, limpiarLlamadas, temaConfig, type Ajustes } from './lib/config'
import { guardarBitacora, quitarUltimasBitacora, charlarIA, transcribirAudio, conectarLocal, estadoLocal, cancelarAgendaServidor, cancelarPedidoFoto, crearAgenda, guardarConfigLocal, leerAgenda, leerImpresoras, pedirFoto, urlFoto, type AgendaItem } from './lib/canalLocal'
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
const ATENTO_CHARLA_MS = 30_000 // atento tras una charla con la IA
const HISTORIAL_MAX = 10 // mensajes que se le mandan a la IA como contexto
const HISTORIAL_VIDA_MS = 5 * 60_000 // pasado este silencio, la conversación empieza de cero
const ESPERA_FIN_MS = 1000 // tras una pausa, espera esto antes de dar por terminada tu frase
const CIERRE_MENSAJE_MS = 5000 // los mensajes se van solos 5 segundos después de decirse
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

/** Lo que se muestra cuando pedís algo por voz: un dibujo en lugar de la cara y la info al costado (hasta el OK o 5 minutos). */
type Vista =
  | { tipo: 'impresoras'; informe: InformeImpresoras }
  | { tipo: 'clima'; clima: Clima; ciudad: string }
  | { tipo: 'foto'; nombre: string; clave: string; desde: number; impresora: Impresora; informe: InformeImpresoras }

/** Una pregunta que Nooby te hizo y espera que le contestes ("¿de cuánto tiempo?", "¿cuándo querés que te lo recuerde?"). */
type Dialogo =
  | { tipo: 'temporizador'; intentos: number }
  | { tipo: 'recordatorio'; texto?: string; cuando?: number; intentos: number }
  | { tipo: 'nota' }

interface Aviso {
  texto: string
  sonido: Sonido
  /** Solo avisos de la impresora: qué dibujo mostrar. */
  estado?: EstadoImpresora
  impresora?: string
  /** De dónde viene la alarma: la impresora (por defecto), un temporizador o un recordatorio. */
  tipo?: 'impresora' | 'temporizador' | 'recordatorio'
  /** Cuándo llegó (reloj del celu): sirve para emparejarlo con su foto. */
  en?: number
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
  // Gestos de la cara: pensando mientras espera a la IA, y expresiones que se muestran al terminar de hablar (risa, bostezo, duda, pena).
  const [razonando, setRazonando] = useState(false)
  const [gesto, setGesto] = useState<Humor | null>(null)
  const [gestoTick, setGestoTick] = useState(0)
  const gestoPendiente = useRef<{ humor: Humor; ms: number } | null>(null)
  const timerGesto = useRef<number | null>(null)
  const hacerGesto = (humor: Humor, ms = 2500) => {
    gestoPendiente.current = { humor, ms }
    setGestoTick((n) => n + 1)
  }
  useEffect(() => {
    // El gesto sale cuando Nooby termina de hablar (o enseguida, si no está hablando).
    if (hablando || !gestoPendiente.current) return
    const g = gestoPendiente.current
    gestoPendiente.current = null
    setGesto(g.humor)
    if (timerGesto.current) window.clearTimeout(timerGesto.current)
    timerGesto.current = window.setTimeout(() => setGesto(null), g.ms)
  }, [hablando, gestoTick])
  const [saludo, setSaludo] = useState(false)
  const [mimo, setMimo] = useState(false)
  const [enojado, setEnojado] = useState(false)
  const [ausenteLargo, setAusenteLargo] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [informe, setInforme] = useState<InformeImpresoras>({ ts: null, impresoras: [] })
  const [fotos, setFotos] = useState<FotoRecibida[]>([])
  const [vista, setVista] = useState<Vista | null>(null)
  // Agenda de la PC (temporizadores y recordatorios) y la diferencia entre el reloj de la PC y el del celu.
  const [agenda, setAgenda] = useState<{ items: AgendaItem[]; desfase: number }>({ items: [], desfase: 0 })
  const [, setTic] = useState(0) // hace latir la cuenta regresiva cada segundo (solo cuando hay un temporizador)
  // Lo que se va oyendo, en tiempo real, para ver si te entiende (ok: ✓ entendió algo, ✗ no).
  const [oyendo, setOyendo] = useState<{ texto: string; final: boolean; ok?: boolean } | null>(null)
  const timerOyendo = useRef<number | null>(null)
  // Oído: 'sin' = no disponible (navegador común); 'listo' = esperando "che nooby"; 'atento' = ya respondió y escucha el pedido
  const [oido, setOido] = useState<'sin' | 'listo' | 'atento'>('sin')
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
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const timerVista = useRef<number | null>(null)
  const dialogoRef = useRef<Dialogo | null>(null)
  const bufferHabla = useRef('')
  // Audio (PCM base64) de lo que se va diciendo, para que Whisper lo transcriba mejor que el reconocedor chico del celu.
  const audioHabla = useRef<string[]>([])
  const whisperApagadoHasta = useRef(0) // si falla (sin clave, sin internet, cupo) se deja de intentar un rato
  const timerFin = useRef<number | null>(null)
  const procesarAtentoRef = useRef<(t: string) => void>(() => {})
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
      opciones: { cerrarEn?: number; forzarVoz?: boolean; estado?: EstadoImpresora; impresora?: string; tipo?: Aviso['tipo'] } = {},
    ) => {
      cortarAlarma()
      setAviso({ texto, sonido, estado: opciones.estado, impresora: opciones.impresora, tipo: opciones.tipo, en: Date.now() })
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
      if (timerCierreAviso.current) window.clearTimeout(timerCierreAviso.current)
      // Los mensajes comunes se van solos 5 segundos después de decirse (lo que dura la voz + 5 s); la alarma, con el OK o a los 5 min.
      const cierre =
        sonido === 'alarma'
          ? (opciones.cerrarEn ?? AVISO_IMPRESORA_MS)
          : (habla ? Math.max(2500, texto.length * 75) : 0) + CIERRE_MENSAJE_MS
      {
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
    void leerImpresoras()
      .then(setInforme)
      .catch(() => {})
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
      alAgenda: (it) => {
        // Venció un temporizador o un recordatorio: suena la alarma y la cara lo muestra hasta el OK (o 5 minutos).
        const texto =
          it.tipo === 'temporizador'
            ? `Terminó el temporizador${it.texto ? ` de ${it.texto}` : it.duracionMs ? ` de ${minutosHablados(it.duracionMs)}` : ''}.`
            : it.texto
              ? `Recordatorio: ${it.texto}.`
              : 'Te aviso: ya es la hora.'
        lanzarAviso(texto, 'alarma', true, { tipo: it.tipo })
        void refrescarAgenda()
      },
      alFoto: (f) =>
        setFotos((previas) =>
          [
            ...previas.filter((p) => p.clave !== f.impresora),
            { clave: f.impresora, nombre: f.nombre, url: urlFoto(f.impresora, f.ts), recibidaEn: Date.now() },
          ].slice(-6),
        ),
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
      // El tiempo se muestra con un dibujo animado (sol, nubes, lluvia…) y los datos al costado, hasta el OK o 5 minutos.
      abrirVista({ tipo: 'clima', clima: c, ciudad })
      hablarSolo(frase(c, ciudad), opciones.forzarVoz)
    } catch (e) {
      const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setNota(`No pude traer el clima (${detalle}).`)
    }
  }

  // Las notas chicas (errores, "Contador en cero"…) también se van solas a los 5 segundos. El estado de arriba ("Sin cámara") queda.
  useEffect(() => {
    if (!nota) return
    const id = window.setTimeout(() => setNota(''), CIERRE_MENSAJE_MS)
    return () => window.clearTimeout(id)
  }, [nota])

  // ---------- voz: "che nooby" + pedidos ----------
  // Conversando (la IA ya contestó) se queda escuchando más rato, sin pedir "che nooby" en cada frase.
  const conversando = useRef(false)
  // Modo privado: mientras está activo no se guarda nada en la bitácora. Se corta al dormirse o con "seguí guardando".
  const bitacoraPausada = useRef(false)
  const saltarGuardado = useRef(0)
  const [privado, setPrivado] = useState(false)
  const ponerPrivado = (v: boolean) => {
    bitacoraPausada.current = v
    setPrivado(v)
  }
  const mantenerAtento = (ms = conversando.current ? ATENTO_CHARLA_MS : 10_000) => {
    if (timerAtento.current) window.clearTimeout(timerAtento.current)
    timerAtento.current = window.setTimeout(() => {
      setOido((o) => (o === 'atento' ? 'listo' : o))
      conversando.current = false
      ponerPrivado(false)
      dialogoRef.current = null
    }, ms)
  }

  // Lo último que dijo por voz, para "repetí".
  const ultimaRespuesta = useRef('')
  // Historial corto de la conversación (lo que dijiste y lo que contestó Nooby) para que la IA entienda "y mañana?".
  const historial = useRef<{ rol: 'yo' | 'nooby'; texto: string; en: number }[]>([])
  const anotar = (rol: 'yo' | 'nooby', texto: string) => {
    const ahora = Date.now()
    if (historial.current.length > 0 && ahora - historial.current[historial.current.length - 1].en > HISTORIAL_VIDA_MS) historial.current = []
    historial.current = [...historial.current, { rol, texto, en: ahora }].slice(-HISTORIAL_MAX)
    // Lo que se habla queda en la bitácora de la PC (salvo modo privado).
    if (saltarGuardado.current > 0 && rol === 'nooby') saltarGuardado.current--
    else if (!bitacoraPausada.current) void guardarBitacora(rol, texto)
  }
  /** Contesta sin dejar la respuesta en la bitácora ("Anotado.", "Listo, borré lo último"). */
  const responderSinGuardar = (texto: string) => {
    saltarGuardado.current++
    responder(texto)
  }
  const responder = (texto: string) => {
    anotar('nooby', texto)
    ultimaRespuesta.current = texto
    lanzarAviso(texto, 'suave', false, { cerrarEn: 12_000, forzarVoz: true })
  }

  // ---------- agenda: temporizadores, recordatorios y cuánto falta ----------
  const refrescarAgenda = async () => {
    try {
      const a = await leerAgenda()
      setAgenda({ items: a.items, desfase: a.ahora - Date.now() })
    } catch {
      /* sin servidor: queda lo que había */
    }
  }
  /** La hora de la PC: "mañana a las 9" se calcula con ella, no con el reloj del celu. */
  const ahoraServidor = async () => {
    try {
      return new Date((await leerAgenda()).ahora)
    } catch {
      return new Date()
    }
  }
  const preguntar = (pregunta: string, d: Dialogo) => {
    dialogoRef.current = d
    responder(pregunta)
    mantenerAtento(15_000) // da tiempo a contestar
  }

  const hacerTemporizador = async (texto: string) => {
    const t = entenderTemporizador(texto)
    if (!t) {
      preguntar('¿De cuánto tiempo?', { tipo: 'temporizador', intentos: 0 })
      return
    }
    dialogoRef.current = null
    try {
      await crearAgenda({ tipo: 'temporizador', texto: t.etiqueta, enMs: t.ms })
      void refrescarAgenda()
      responder(`Listo, temporizador de ${minutosHablados(t.ms)}${t.etiqueta ? ` para ${t.etiqueta}` : ''}.`)
    } catch {
      responder('No pude crear el temporizador.')
    }
  }

  const hacerRecordatorio = async (texto: string, previo?: { texto?: string; cuando?: number }) => {
    const ahoraSrv = await ahoraServidor()
    const e = entenderRecordatorio(texto, ahoraSrv)
    const mensaje = previo?.texto || e.texto
    const cuando = previo?.cuando ?? e.momento?.cuando.getTime()
    if (previo?.cuando == null && e.momento?.pasado) {
      preguntar('Esa hora ya pasó. ¿Para cuándo lo querés?', { tipo: 'recordatorio', texto: mensaje || undefined, intentos: 0 })
      return
    }
    if (!mensaje && cuando == null) {
      preguntar('¿Qué querés que te recuerde?', { tipo: 'recordatorio', intentos: 0 })
      return
    }
    if (cuando == null) {
      preguntar('¿Cuándo querés que te lo recuerde?', { tipo: 'recordatorio', texto: mensaje, intentos: 0 })
      return
    }
    if (!mensaje) {
      preguntar('¿Qué querés que te recuerde?', { tipo: 'recordatorio', cuando, intentos: 0 })
      return
    }
    dialogoRef.current = null
    try {
      await crearAgenda({ tipo: 'recordatorio', texto: mensaje, cuando })
      void refrescarAgenda()
      responder(`Listo, te lo recuerdo ${describirMomento(new Date(cuando), ahoraSrv)}: ${mensaje}.`)
    } catch {
      responder('No pude guardar el recordatorio.')
    }
  }

  /** Si hay una pregunta pendiente, lo que decís es la respuesta. Devuelve true si se usó para eso. */
  const continuarDialogo = (texto: string): boolean => {
    const d = dialogoRef.current
    if (!d) return false
    if (/\b(cancela|cancelar|olvidalo|olvidate|dejalo|no importa)\b/.test(normalizar(texto))) {
      dialogoRef.current = null
      responder('Bueno, lo dejamos.')
      return true
    }
    // Esperaba qué anotar: todo lo que diga es la nota.
    if (d.tipo === 'nota') {
      dialogoRef.current = null
      void guardarNota(texto)
      return true
    }
    // Un pedido claro y nuevo ("poneme un temporizador", "qué recordatorios tengo") corta la pregunta pendiente y se atiende.
    const nuevo = interpretar(texto)
    if (nuevo && ['temporizador', 'recordatorio', 'listarAgenda', 'cancelarAgenda', 'faltaPara', 'chau', 'despedida'].includes(nuevo)) {
      dialogoRef.current = null
      return false
    }
    // Esperaba el mensaje: todo lo que diga es el mensaje (y si trae la hora, también se toma).
    if (d.tipo === 'recordatorio' && !d.texto) {
      const limpio = entenderRecordatorio(texto, new Date()).texto || texto.trim()
      void hacerRecordatorio(texto, { cuando: d.cuando, texto: limpio })
      return true
    }
    // Esperaba la duración o el momento: si lo que dijo no lo tiene, o es otro pedido, o se repite la pregunta una vez.
    const entendio = d.tipo === 'temporizador' ? entenderTemporizador(texto) !== null : extraerMomento(tokenizar(texto), new Date()) !== null
    if (entendio) {
      if (d.tipo === 'temporizador') void hacerTemporizador(texto)
      else void hacerRecordatorio(texto, { texto: d.texto })
      return true
    }
    if (interpretar(texto)) {
      dialogoRef.current = null // era otro pedido: se atiende normal
      return false
    }
    if (d.intentos >= 1) {
      dialogoRef.current = null
      responder('¿Cómo? Lo dejamos así.')
      return true
    }
    d.intentos++
    preguntar(d.tipo === 'temporizador' ? '¿Cómo? ¿De cuánto tiempo?' : '¿Cómo? ¿Para cuándo?', d)
    return true
  }

  const guardarNota = async (nota: string) => {
    const ok = await guardarBitacora('nota', nota)
    responderSinGuardar(ok ? 'Anotado.' : 'No pude guardarlo en la bitácora.')
  }

  const contarCuantoFalta = async (texto: string) => {
    const ahoraSrv = await ahoraServidor()
    responder(cuantoFalta(texto, ahoraSrv) ?? '¿Para qué fecha? Decime, por ejemplo, cuánto falta para Navidad.')
  }

  const listarAgenda = async () => {
    try {
      const a = await leerAgenda()
      setAgenda({ items: a.items, desfase: a.ahora - Date.now() })
      if (a.items.length === 0) {
        responder('No tenés recordatorios ni temporizadores pendientes.')
        return
      }
      const frases = a.items.slice(0, 4).map((i) =>
        i.tipo === 'temporizador'
          ? `Temporizador${i.texto ? ` de ${i.texto}` : ''}: faltan ${minutosHablados(i.cuando - a.ahora)}`
          : `Recordatorio: ${i.texto || 'sin texto'}, ${describirMomento(new Date(i.cuando), new Date(a.ahora))}`,
      )
      responder(`Tenés ${a.items.length === 1 ? '1 cosa anotada' : `${a.items.length} cosas anotadas`}. ${frases.join('. ')}.`)
    } catch {
      responder('No pude mirar la agenda.')
    }
  }

  const cancelarAgenda = async (texto: string) => {
    const t = normalizar(texto)
    const tipo = /\b(temporizador|temporizadores|timer)\b/.test(t) ? 'temporizador' : /\b(recordatorio|recordatorios|aviso|avisos)\b/.test(t) ? 'recordatorio' : undefined
    try {
      const n = await cancelarAgendaServidor(tipo ? { tipo } : { todos: true })
      void refrescarAgenda()
      if (n === 0) responder('No tenías nada pendiente de eso.')
      else if (tipo === 'temporizador') responder(n === 1 ? 'Listo, cancelé el temporizador.' : `Listo, cancelé ${n} temporizadores.`)
      else if (tipo === 'recordatorio') responder(n === 1 ? 'Listo, cancelé el recordatorio.' : `Listo, cancelé ${n} recordatorios.`)
      else responder(n === 1 ? 'Listo, cancelé 1 cosa.' : `Listo, cancelé ${n} cosas.`)
    } catch {
      responder('No pude cancelar.')
    }
  }

  // La cuenta regresiva y el refresco de la agenda mientras hay servidor.
  useEffect(() => {
    if (modo !== 'local') return
    void refrescarAgenda()
    const id = window.setInterval(() => void refrescarAgenda(), 60_000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])
  const hayTemporizador = agenda.items.some((i) => i.tipo === 'temporizador')
  useEffect(() => {
    if (!hayTemporizador) return
    const id = window.setInterval(() => setTic((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [hayTemporizador])

  // Vistas: el dibujo (impresora, sol, nubes…) toma el lugar de la cara y la info queda al costado.
  /** Si la vista que se va era una foto pedida, se avisa que ya no hace falta (si el agente todavía no la mandó). */
  const soltarPedido = (v: Vista | null) => {
    if (v?.tipo === 'foto') void cancelarPedidoFoto(v.nombre).catch(() => {})
  }
  const abrirVista = (v: Vista) => {
    soltarPedido(vistaRef.current)
    setVista(v)
    if (timerVista.current) window.clearTimeout(timerVista.current)
    timerVista.current = window.setTimeout(() => {
      soltarPedido(vistaRef.current)
      setVista(null)
    }, AVISO_IMPRESORA_MS)
  }
  const cerrarVista = () => {
    soltarPedido(vistaRef.current)
    if (timerVista.current) window.clearTimeout(timerVista.current)
    setVista(null)
  }

  /** "Mostrame la H2C": le pide la foto al agente y abre la vista (la imagen llega sola cuando el agente la manda). */
  const pedirVerImpresora = async (texto: string) => {
    try {
      const d = await leerImpresoras()
      const vigente = d.ts != null && Date.now() - d.ts <= INFORME_VIGENTE_MS && d.impresoras.length > 0
      if (!vigente) {
        responder('Todavía no sé qué impresoras hay.')
        return
      }
      const e = elegirImpresora(texto, d.impresoras)
      if (!e) return
      const { impresora } = e
      await pedirFoto(impresora.nombre)
      setInforme(d)
      abrirVista({ tipo: 'foto', nombre: impresora.nombre, clave: claveImpresora(impresora.nombre), desde: Date.now(), impresora, informe: d })
      hablarSolo(
        e.porNombre || d.impresoras.length === 1
          ? `Un momento, le pido la foto de ${impresora.nombre}.`
          : `No dijiste cuál, te muestro ${impresora.nombre}. Le pido la foto.`,
        true,
      )
    } catch {
      responder('No pude pedir la foto.')
    }
  }
  /** Dice algo en voz alta sin mostrar burbuja (la info ya está en la vista). */
  const hablarSolo = (texto: string, forzar = false) => {
    ultimaRespuesta.current = texto
    anotar('nooby', texto) // clima, impresoras…: también quedan en la bitácora y la IA sabe qué se contestó
    if (!forzar && !ajustesRef.current.voz) return
    setHablando(true)
    hablar(texto)
    window.setTimeout(() => setHablando(false), Math.max(2500, texto.length * 75))
  }

  const ejecutar = (orden: Orden, texto = '') => {
    const { nombre } = ajustesRef.current
    const ahora = new Date()
    switch (orden) {
      case 'clima':
        void verClima({ cerrarEn: 15_000, forzarVoz: true })
        break
      case 'hora':
        responder(dichos.horaHablada(ahora.getHours(), ahora.getMinutes()))
        break
      case 'fecha':
        responder(dichos.fechaHablada(ahora))
        break
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
      case 'anotarBitacora': {
        const nota = extraerNota(texto)
        if (nota) void guardarNota(nota)
        else preguntar('¿Qué querés que anote?', { tipo: 'nota' })
        break
      }
      case 'pausarBitacora':
        ponerPrivado(true)
        responder('Listo, no guardo lo que sigue. Decime «seguí guardando» cuando quieras.')
        break
      case 'retomarBitacora':
        ponerPrivado(false)
        responder('Perfecto, vuelvo a guardar.')
        break
      case 'borrarUltimo':
        void quitarUltimasBitacora(2)
          .then((n) => responderSinGuardar(n > 0 ? 'Listo, borré lo último de la bitácora.' : 'No hay nada para borrar.'))
          .catch(() => responderSinGuardar('No pude borrarlo.'))
        break
      case 'temporizador':
        void hacerTemporizador(texto)
        break
      case 'recordatorio':
        void hacerRecordatorio(texto)
        break
      case 'faltaPara':
        void contarCuantoFalta(texto)
        break
      case 'listarAgenda':
        void listarAgenda()
        break
      case 'cancelarAgenda':
        void cancelarAgenda(texto)
        break
      case 'verCamara':
        void pedirVerImpresora(texto)
        break
      case 'impresoras':
        void leerImpresoras()
          .then((d) => {
            const texto = describirImpresoras(d, Date.now())
            const vigente = d.ts != null && Date.now() - d.ts <= INFORME_VIGENTE_MS && d.impresoras.length > 0
            if (vigente) {
              // Con datos frescos: la impresora dibujada en lugar de la cara y una tarjeta por impresora al costado.
              setInforme(d)
              abrirVista({ tipo: 'impresoras', informe: d })
              hablarSolo(texto, true)
            } else {
              responder(texto) // sin datos (o viejos) no hay nada que dibujar: solo lo dice
            }
          })
          .catch(() => responder('No pude consultar las impresoras.'))
        break
      case 'chau':
        cerrarVista()
        responder('De nada.')
        break
      case 'despedida':
        cerrarVista()
        responder(dichos.despedida(nombre))
        break
      case 'ayuda':
        responder(
          'Podés pedirme la hora, la fecha, el clima, cómo van las impresoras, que te muestre una impresora, cuánto llevás sentado, un chiste, o decirme que ya te levantaste o tomaste agua. Todas las frases están en el panel.',
        )
        break
      case 'queHaces': {
        // Pregunta por las impresoras en el momento (no usa un informe guardado que puede estar viejo).
        const sentadoMin = minutos(sentado.current.sentadoMs)
        void leerImpresoras()
          .catch(() => null)
          .then((d) => {
            const vigente = d != null && d.ts != null && Date.now() - d.ts <= INFORME_VIGENTE_MS
            const imprimiendo = vigente ? d.impresoras.filter((p) => p.estado === 'imprimiendo').map((p) => p.nombre) : []
            responder(dichos.queEstoyHaciendo({ sentadoMin, imprimiendo }))
          })
        break
      }
      case 'comoEstas':
        responder(dichos.comoEstoy(nombre))
        break
      case 'quienSos':
        responder(dichos.quienSoy())
        break
      case 'estasAhi':
        responder(dichos.estoyAhi(nombre))
        break
      case 'saludo':
        responder(dichos.saludoSegunHora(ahora.getHours(), nombre))
        break
      case 'cansado':
        responder(dichos.estoyCansado())
        hacerGesto('bostezo', 2800)
        break
      case 'chiste':
        responder(dichos.chiste())
        hacerGesto('risa', 2800)
        break
      case 'repetir':
        responder(ultimaRespuesta.current || 'Todavía no dije nada.')
        break
    }
  }

  const despertar = () => {
    setOido('atento')
    lanzarAviso(`Sí, ${ajustesRef.current.nombre}`, 'suave', false, { cerrarEn: 6000, forzarVoz: true })
    mantenerAtento(12_000)
  }

  /** Lo que ninguna regla entiende va a la IA (en la PC). Sin IA configurada o una sola palabra: el "¿Cómo?" de siempre. */
  const charlarLibre = async (texto: string) => {
    const noEntendi = () => {
      responder('¿Cómo? No te entendí.')
      hacerGesto('confuso')
      mantenerAtento()
    }
    if (texto.trim().split(/\s+/).length < 2) return noEntendi()
    mantenerAtento(30_000) // no se duerme mientras piensa
    setNota('Pensando…')
    setRazonando(true)
    try {
      const msgs = historial.current.map(({ rol, texto: t }) => ({ rol, texto: t }))
      const r = await charlarIA(msgs, minutos(sentado.current.sentadoMs))
      setNota('')
      setRazonando(false)
      if (r.error === 'sin_clave') return noEntendi()
      if (r.error) hacerGesto('triste')
      responder(r.texto)
      void refrescarAgenda() // por si la IA puso o canceló un temporizador o recordatorio
      conversando.current = true // modo conversación: sigue escuchando sin que lo despiertes de nuevo
      mantenerAtento()
    } catch {
      setNota('')
      setRazonando(false)
      noEntendi()
    }
  }

  const atender = (texto: string) => {
    const orden = interpretar(texto)
    // Lo que decís queda en la bitácora (también las respuestas a una pregunta), salvo estos pedidos y las notas.
    if (orden !== 'pausarBitacora' && orden !== 'borrarUltimo' && dialogoRef.current?.tipo !== 'nota') anotar('yo', texto)
    if (dialogoRef.current && continuarDialogo(texto)) {
      mantenerAtento(15_000)
      return
    }
    if (!orden) {
      void charlarLibre(texto)
      return
    }
    ejecutar(orden, texto)
    if (orden === 'chau' || orden === 'despedida') {
      if (timerAtento.current) window.clearTimeout(timerAtento.current)
      conversando.current = false
      ponerPrivado(false)
      setOido('listo')
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

  // Lo que decís aparece en pantalla mientras lo decís (y 5 s después), con ✓ si entendió algo y ✗ si no.
  const entendioFinal = (t: string): boolean | undefined => {
    const llamado = detectarLlamado(t, {
      gramatica: typeof window.NoobyNativo?.modoOido === 'function',
      variantes: ajustesRef.current.llamadas,
    }).llamado
    if (avisoRef.current?.sonido === 'alarma') return esConfirmacion(t)
    if (entrenandoRef.current) return undefined
    if (oidoRef.current === 'atento') return interpretar(t) !== null || llamado || (vistaRef.current != null && esConfirmacion(t))
    return llamado
  }
  const mostrarOyendo = (texto: string, final: boolean) => {
    const limpio = texto.replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!limpio) return
    const corto = limpio.length > 70 ? '…' + limpio.slice(-68) : limpio // se ve lo último que dijiste
    setOyendo((a) => (a && a.texto === corto && a.final === final ? a : { texto: corto, final, ok: final ? entendioFinal(limpio) : undefined }))
    if (timerOyendo.current) window.clearTimeout(timerOyendo.current)
    timerOyendo.current = window.setTimeout(() => setOyendo(null), final ? CIERRE_MENSAJE_MS : 3000)
  }

  // Esperar a que termines: una pausa en medio de la frase no la corta. Lo que va diciendo se junta y recién se atiende cuando pasa
  // un rato sin que hables (ESPERA_FIN_MS).
  const procesarAtento = (oido: string) => {
    if (oidoRef.current !== 'atento') return
    // Si el micrófono pescó la voz de Nooby (eco o respuesta larga), se sacan esas frases y queda solo lo que dijiste vos.
    const texto = quitarEco(oido, historial.current.filter((h) => h.rol === 'nooby').slice(-2).map((h) => h.texto))
    if (!texto) return
    if (vistaRef.current && esConfirmacion(texto)) {
      cerrarVista() // con una vista en pantalla, "OK" la cierra
      return
    }
    const llamado = detectarLlamado(texto, {
      gramatica: typeof window.NoobyNativo?.modoOido === 'function',
      variantes: ajustesRef.current.llamadas,
    })
    if (llamado.llamado && !interpretar(llamado.resto)) despertar()
    else atender(llamado.llamado ? llamado.resto : texto)
  }
  procesarAtentoRef.current = procesarAtento
  const rearmarFin = () => {
    if (timerFin.current) window.clearTimeout(timerFin.current)
    timerFin.current = window.setTimeout(() => {
      const t = bufferHabla.current
      const audio = audioHabla.current
      bufferHabla.current = ''
      audioHabla.current = []
      if (!t) return
      if (audio.length === 0 || Date.now() < whisperApagadoHasta.current) {
        procesarAtentoRef.current(t)
        return
      }
      // Con el audio, Whisper entiende mucho mejor que Vosk: si contesta se usa su texto; si no, el de Vosk.
      void transcribirAudio(audio)
        .then((w) => {
          if (w) {
            mostrarOyendo(w, true)
            procesarAtentoRef.current(w)
          } else {
            whisperApagadoHasta.current = Date.now() + 60_000
            procesarAtentoRef.current(t)
          }
        })
        .catch(() => {
          whisperApagadoHasta.current = Date.now() + 60_000
          procesarAtentoRef.current(t)
        })
    }, ESPERA_FIN_MS)
  }

  // Lo que oye el celu llega como texto (el APK solo hace de micrófono): acá se decide qué hacer.
  alOirRef.current = (d) => {
    const final = typeof d?.text === 'string'
    const texto = (final ? d.text : d?.partial) ?? ''
    if (!texto) return
    mostrarOyendo(texto, final)
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
      mantenerAtento() // mientras habla, no se duerme
    }
    // Atento: si ya dijiste algo y seguís hablando, se reinicia la espera.
    if (oidoRef.current === 'atento' && bufferHabla.current && !final) rearmarFin()
    if (!final) return
    if (oidoRef.current === 'atento') {
      bufferHabla.current = (bufferHabla.current + ' ' + texto).trim()
      rearmarFin()
      return
    }
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
    // El APK nuevo manda el audio de cada frase justo antes de su texto. Solo se guarda mientras está atento.
    const alAudio = (e: Event) => {
      const pcm = (e as CustomEvent<{ pcm?: string }>).detail?.pcm
      if (typeof pcm !== 'string' || oidoRef.current !== 'atento' || entrenandoRef.current || avisoRef.current?.sonido === 'alarma') return
      audioHabla.current = [...audioHabla.current, pcm].slice(-8)
    }
    window.addEventListener('nooby-oyo', alOyo)
    window.addEventListener('nooby-audio', alAudio)
    window.addEventListener('nooby-oido-listo', alListo)
    window.addEventListener('nooby-oido-error', alError)
    window.addEventListener('nooby-hablo-fin', alFinHabla)
    return () => {
      window.removeEventListener('nooby-oyo', alOyo)
      window.removeEventListener('nooby-audio', alAudio)
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
          : gesto
            ? gesto
            : razonando
              ? 'pensando'
              : oido === 'atento' || entrenandoActivo
                ? 'atento'
            : mimo || saludo
              ? 'feliz'
              : conCamara && ausenteLargo
                ? 'dormido'
                : 'normal'

  const enlaceOk = ntfyOk === true
  // Cuenta regresiva del próximo temporizador (con la hora de la PC).
  const cuentaRegresiva = (() => {
    const tm = agenda.items.filter((i) => i.tipo === 'temporizador')
    if (tm.length === 0) return ''
    const falta = Math.max(0, Math.min(...tm.map((i) => i.cuando)) - (Date.now() + agenda.desfase))
    const seg = Math.ceil(falta / 1000)
    const h = Math.floor(seg / 3600)
    const m = Math.floor((seg % 3600) / 60)
    const ss = String(seg % 60).padStart(2, '0')
    return ` · ⏱ ${h > 0 ? `${h}:${String(m).padStart(2, '0')}` : m}:${ss}${tm.length > 1 ? ` (+${tm.length - 1})` : ''}`
  })()
  // La foto pedida: la que llegó de esa impresora después de pedirla.
  const fotoVista = vista?.tipo === 'foto' ? (fotos.find((f) => (f.clave === vista.clave || f.clave === 'general') && f.recibidaEn >= vista.desde - 1000) ?? null) : null
  // Cómo se dibuja la impresora de la vista: según la impresora que más importa (error > pausa > imprimiendo…).
  const estadoVista: EstadoImpresora = (() => {
    if (vista?.tipo !== 'impresoras') return 'imprimiendo'
    const p = ordenarPorRelevancia(vista.informe.impresoras)[0]
    return !p ? 'libre' : p.estado === 'offline' ? 'libre' : p.estado
  })()
  const estadoAviso: EstadoImpresora = aviso?.estado ?? inferirEstado(aviso?.texto ?? '')
  // La foto que llegó junto con este aviso (si el agente mandó una).
  const fotoAviso = aviso?.sonido === 'alarma' ? elegirFoto(fotos, aviso.en ?? 0, aviso.impresora) : null

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
              aviso.tipo === 'temporizador' || aviso.tipo === 'recordatorio' ? (
                <RelojAnimado tipo={aviso.tipo} />
              ) : (
                <ImpresoraAnimada estado={estadoAviso} />
              )
            ) : vista?.tipo === 'impresoras' ? (
              <ImpresoraAnimada estado={estadoVista} />
            ) : vista?.tipo === 'foto' ? (
              <VisorFoto key={vista.desde} url={fotoVista?.url} nombre={vista.nombre} />
            ) : vista?.tipo === 'clima' ? (
              <ClimaAnimado escena={escenaClima(vista.clima.codigo, vista.clima.esDia)} />
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
              {cuentaRegresiva}
              {privado && ' · 🔒 privado'}
            </p>

            <p className={`zona-oyendo${oyendo?.final ? ' final' : ''}`} aria-live="polite">
              {oyendo && (
                <>
                  🎤 «{oyendo.texto}»
                  {oyendo.ok === true && <b className="si"> ✓</b>}
                  {oyendo.ok === false && <b className="no"> ✗</b>}
                </>
              )}
            </p>

            <div className="zona-mensaje">
              {aviso?.sonido === 'alarma' && (aviso.tipo === 'temporizador' || aviso.tipo === 'recordatorio') ? (
                <PanelAviso tipo={aviso.tipo} texto={aviso.texto} alOk={entendido} />
              ) : aviso?.sonido === 'alarma' ? (
                <PanelImpresora
                  texto={aviso.texto}
                  estado={estadoAviso}
                  informe={informe}
                  impresora={aviso.impresora}
                  foto={fotoAviso?.url}
                  alOk={entendido}
                />
              ) : aviso ? (
                <div className={`burbuja ${aviso.sonido}`} role="alert">
                  <p>{aviso.texto}</p>
                  <button className={`boton grande ${aviso.sonido}`} onClick={entendido}>
                    Entendido
                  </button>
                </div>
              ) : vista ? (
                vista.tipo === 'foto' ? (
                  <PanelImpresora
                    texto={`Foto de ${vista.nombre}`}
                    estado={vista.impresora.estado}
                    informe={vista.informe}
                    impresora={vista.nombre}
                    soloUna
                    alOk={cerrarVista}
                  />
                ) : vista.tipo === 'impresoras' ? (
                  <PanelImpresora texto="Estado de las impresoras" estado={estadoVista} informe={vista.informe} alOk={cerrarVista} />
                ) : (
                  <PanelClima ciudad={vista.ciudad} clima={vista.clima} alOk={cerrarVista} />
                )
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
                </p>
              ) : (
                nota && <p className="nota">{nota}</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
