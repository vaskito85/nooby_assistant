// Hacia dónde miran los ojos. Se mueve en cada cuadro de pantalla (suave, sin esperar a React):
// la cámara dice dónde está la cara varias veces por segundo y los ojos van detrás con un suavizado corto.
// Escribe dos variables CSS (--gx, --gy, de -1 a 1) que usa estilos.css para desplazar los ojos.

/** La cara casi nunca llega a los bordes del cuadro: se amplifica para que el movimiento se note. */
const GANANCIA = 2.4
/** Qué tan rápido alcanzan el objetivo (0–1 por cuadro). */
const SUAVIZADO = 0.28

const limitar = (v: number) => Math.max(-1, Math.min(1, v))

export class Mirada {
  private tx = 0
  private ty = 0
  private cx = 0
  private cy = 0
  private raf = 0
  // Sin a quién mirar los ojos no quedan clavados al centro: de vez en cuando se van a otro lado (como una persona distraída).
  private ocioso = true
  private proxDistraccion = 0

  constructor(private el: HTMLElement) {
    const paso = () => {
      if (this.ocioso) this.distraer()
      this.cx += (this.tx - this.cx) * SUAVIZADO
      this.cy += (this.ty - this.cy) * SUAVIZADO
      this.el.style.setProperty('--gx', this.cx.toFixed(3))
      this.el.style.setProperty('--gy', this.cy.toFixed(3))
      this.raf = requestAnimationFrame(paso)
    }
    this.raf = requestAnimationFrame(paso)
  }

  /** x, y: posición de la cara en el cuadro, de -1 a 1 (x: derecha de la pantalla = +). */
  apuntar(x: number, y: number) {
    this.ocioso = false
    this.tx = limitar(x * GANANCIA)
    this.ty = limitar(y * GANANCIA)
  }

  /** Sin a quién mirar: ojos al centro. */
  descansar() {
    if (!this.ocioso) {
      this.ocioso = true
      this.tx = 0
      this.ty = 0
      this.proxDistraccion = performance.now() + 1500
    }
  }

  private distraer() {
    const ahora = performance.now()
    if (ahora < this.proxDistraccion) return
    // 4 de cada 10 veces vuelve al centro; si no, mira un poco hacia algún costado, arriba o abajo.
    if (Math.random() < 0.4) {
      this.tx = 0
      this.ty = 0
    } else {
      this.tx = (Math.random() * 2 - 1) * 0.5
      this.ty = (Math.random() * 2 - 1) * 0.3
    }
    this.proxDistraccion = ahora + 1800 + Math.random() * 3200
  }

  detener() {
    cancelAnimationFrame(this.raf)
  }
}
