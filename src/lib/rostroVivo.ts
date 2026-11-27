// Anima la cara (el SVG de Cara.tsx) cuadro a cuadro, fuera de React: cada número de la pose se acerca suave a su objetivo, los ojos
// parpadean solos, la boca sigue las letras de lo que se dice y la cabeza "respira". Nada de esto cambia el tamaño del cuadro.

import { BOCA_X, BOCA_Y, duracionEstimada, pasoEn, planHabla, POSES, trazoBoca, type Humor, type Paso, type Pose } from './rostro'

type Clave = 'lid' | 'lidAng' | 'lift' | 'ojo' | 'ceja' | 'cejaAng' | 'cejaIzq' | 'ancho' | 'abre' | 'sonrisa' | 'redonda' | 'mejilla' | 'incl'
const CLAVES: Clave[] = ['lid', 'lidAng', 'lift', 'ojo', 'ceja', 'cejaAng', 'cejaIzq', 'ancho', 'abre', 'sonrisa', 'redonda', 'mejilla', 'incl']

/** Qué tan rápido se acerca cada número a su objetivo (más alto = más rápido). */
const K_SUAVE = 9
const K_BOCA_HABLANDO = 24
/** La voz tarda un instante en arrancar desde que se le pide hablar. */
const LATENCIA_VOZ_MS = 280

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export class RostroVivo {
  private actual: Pose = { ...POSES.normal }
  private objetivo: Pose = { ...POSES.normal }
  private humor: Humor = 'normal'
  private raf = 0
  private ultimo = 0
  // parpadeo
  private proxParpadeo = 0
  private inicioParpadeo = -1
  private dobleParpadeo = false
  // habla
  private plan: Paso[] | null = null
  private inicioHabla = 0
  private pasoPrevio: Paso | null = null
  private enfasis = 0
  private partes = new Map<string, Element>()

  constructor(private svg: SVGSVGElement) {
    for (const el of svg.querySelectorAll('[data-parte]')) this.partes.set(el.getAttribute('data-parte') ?? '', el)
    this.proxParpadeo = performance.now() + 1500
    const paso = (t: number) => {
      this.tick(t)
      this.raf = requestAnimationFrame(paso)
    }
    this.raf = requestAnimationFrame(paso)
  }

  detener() {
    cancelAnimationFrame(this.raf)
  }

  /** Cambia de humor: los números viajan suave a la nueva pose. */
  poner(humor: Humor) {
    this.humor = humor
    this.objetivo = { ...POSES[humor] }
    // Algunos humores miran a un lugar fijo (pensando mira hacia arriba); el resto sigue a la persona (--gx/--gy de mirada.ts).
    const p = POSES[humor]
    if (p.miraX !== undefined) {
      this.svg.style.setProperty('--gx', String(p.miraX))
      this.svg.style.setProperty('--gy', String(p.miraY ?? 0))
    } else {
      this.svg.style.removeProperty('--gx')
      this.svg.style.removeProperty('--gy')
    }
  }

  /** Empieza a mover la boca siguiendo las letras del texto (dura lo que se estima que tarda la voz). */
  hablar(texto: string) {
    this.plan = planHabla(texto, duracionEstimada(texto))
    this.inicioHabla = performance.now() + LATENCIA_VOZ_MS
    this.pasoPrevio = null
  }

  callar() {
    this.plan = null
    this.pasoPrevio = null
  }

  private parte(n: string) {
    return this.partes.get(n)
  }

  private tick(ahora: number) {
    const dt = Math.min(0.05, Math.max(0.001, (ahora - (this.ultimo || ahora)) / 1000))
    this.ultimo = ahora
    const hablando = this.humor === 'hablando'
    const obj: Pose = { ...this.objetivo }

    // --- la boca mientras habla: una forma por letra; si el texto ya terminó pero la voz sigue, un movimiento suave
    if (hablando) {
      const u = ahora - this.inicioHabla
      const paso = this.plan ? pasoEn(this.plan, u) : null
      if (paso) {
        const variacion = 0.9 + Math.random() * 0.2
        obj.abre = Math.min(1, paso.abre * variacion)
        obj.ancho = lerp(obj.ancho, paso.ancho, 0.85)
        obj.redonda = paso.redonda
        if (paso !== this.pasoPrevio) {
          // De vez en cuando una vocal abierta viene con un gesto de cejas, como al enfatizar.
          if (paso.abre > 0.85 && Math.random() < 0.18) this.enfasis = 1
          this.pasoPrevio = paso
        }
      } else if (!this.plan || u > 0) {
        obj.abre = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(ahora / 130))
      }
      obj.incl += Math.sin(ahora / 900) * 1.5
    }
    this.enfasis *= Math.exp(-dt * 5)
    obj.ceja += this.enfasis * 0.3

    // --- risa: la boca rebota
    if (this.humor === 'risa') obj.abre = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(ahora / 95))

    // --- suavizado
    const kBoca = hablando ? K_BOCA_HABLANDO : K_SUAVE
    for (const c of CLAVES) {
      const k = c === 'abre' || c === 'ancho' || c === 'redonda' ? kBoca : K_SUAVE
      this.actual[c] += (obj[c] - this.actual[c]) * (1 - Math.exp(-k * dt))
    }

    // --- parpadeo (solo si los ojos están abiertos)
    let parpadeo = 0
    if (this.inicioParpadeo >= 0) {
      const u = (ahora - this.inicioParpadeo) / 150
      if (u >= 1) {
        this.inicioParpadeo = -1
        if (this.dobleParpadeo) {
          this.dobleParpadeo = false
          this.proxParpadeo = ahora + 120
        } else this.proxParpadeo = ahora + 2200 + Math.random() * 3800
      } else parpadeo = Math.sin(Math.PI * u)
    } else if (ahora >= this.proxParpadeo && this.actual.lid < 0.6) {
      this.inicioParpadeo = ahora
      this.dobleParpadeo = Math.random() < 0.15
    }

    this.dibujar(parpadeo, ahora)
  }

  private dibujar(parpadeo: number, ahora: number) {
    const p = this.actual
    const f = (n: number) => n.toFixed(2)
    const respira = this.humor === 'dormido' ? 0.016 * Math.sin(ahora / 1100) : 0.007 * Math.sin(ahora / 1500)

    // cabeza (los rasgos; la placa queda quieta): inclinación y respiración
    this.parte('rasgos')?.setAttribute('transform', `translate(250 200) rotate(${f(p.incl)}) scale(${f(1 + respira)}) translate(-250 -200)`)

    // ojos
    const lid = Math.max(p.lid, parpadeo)
    for (const [lado, signo] of [['I', 1], ['D', -1]] as const) {
      this.parte('ojo' + lado)?.setAttribute('transform', `translate(${lado === 'I' ? 150 : 350} 150) scale(${f(p.ojo)})`)
      this.parte('lidSup' + lado)?.setAttribute('transform', `translate(0 ${f(-66 + Math.min(1, lid) * 132)}) rotate(${f(p.lidAng * signo)})`)
      this.parte('lidInf' + lado)?.setAttribute('cy', f(134 - p.lift * 66))
    }

    // cejas: la de adentro baja con el enojo y sube con la tristeza; la izquierda puede subir sola (duda)
    for (const [lado, signo] of [['I', -1], ['D', 1]] as const) {
      const cx = 250 + signo * 100
      const base = 58 - p.ceja * 26 - (lado === 'I' ? p.cejaIzq * 22 : 0)
      const yIn = base + p.cejaAng * 20
      const yOut = base - p.cejaAng * 9
      const medio = (yIn + yOut) / 2 - 12 * (1 - 0.7 * Math.max(0, p.cejaAng))
      const ctrl = 2 * medio - (yIn + yOut) / 2
      this.parte('ceja' + lado)?.setAttribute('d', `M${f(cx - signo * 48)} ${f(yIn)} Q${f(cx)} ${f(ctrl)} ${f(cx + signo * 50)} ${f(yOut)}`)
    }

    // mejillas
    const mej = this.parte('mejillas')
    if (mej) (mej as SVGElement).style.opacity = f(Math.max(0, Math.min(1, p.mejilla)) * 0.55)

    // boca: contorno, relleno, dientes y lengua (recortados por el contorno)
    const b = trazoBoca(p)
    for (const n of ['bocaLinea', 'bocaRelleno', 'bocaClip']) this.parte(n)?.setAttribute('d', b.d)
    const abierta = b.alto > 5
    const dientes = this.parte('dientes')
    if (dientes) {
      dientes.setAttribute('x', f(BOCA_X - b.ancho / 2))
      dientes.setAttribute('width', f(b.ancho))
      dientes.setAttribute('y', f(b.medioArriba - 14))
      dientes.setAttribute('height', f(Math.min(24, 8 + b.alto * 0.35)))
      ;(dientes as SVGElement).style.opacity = abierta ? '1' : '0'
    }
    const lengua = this.parte('lengua')
    if (lengua) {
      lengua.setAttribute('cx', f(BOCA_X))
      lengua.setAttribute('cy', f(b.medioAbajo - 6))
      lengua.setAttribute('rx', f(b.ancho * 0.3))
      lengua.setAttribute('ry', f(Math.max(6, b.alto * 0.28)))
      ;(lengua as SVGElement).style.opacity = b.alto > 22 ? '1' : '0'
    }
    void BOCA_Y
  }
}
