// Cuenta cuánto tiempo seguido estás sentado y dice cuándo avisar. Lógica pura (sin DOM).

export interface ConfigSentado {
  /** A los cuántos ms sentado se avisa la primera vez. */
  limiteMs: number
  /** Si no te ve por este tiempo, se considera que te fuiste de la silla. */
  graciaMs: number
  /** Si estás ausente este tiempo, el contador vuelve a 0 (descansaste). */
  ausenciaResetMs: number
  /** Cada cuánto repetir el aviso si seguís sentado. */
  repetirMs: number
}

export interface ResultadoTick {
  presente: boolean
  sentadoMs: number
  avisar: boolean
}

export class Sentado {
  sentadoMs = 0
  private ultimaVista = 0
  private ultimoTick = 0
  private proximoAviso: number

  constructor(public cfg: ConfigSentado) {
    this.proximoAviso = cfg.limiteMs
  }

  tick(ahora: number, visible: boolean): ResultadoTick {
    // Tope de 5 s por tick: si el celu se durmió, no sumamos horas de golpe.
    const dt = this.ultimoTick ? Math.min(ahora - this.ultimoTick, 5000) : 0
    this.ultimoTick = ahora
    if (visible) this.ultimaVista = ahora

    const presente = this.ultimaVista > 0 && ahora - this.ultimaVista <= this.cfg.graciaMs
    if (presente) {
      this.sentadoMs += dt
    } else if (this.ultimaVista > 0 && ahora - this.ultimaVista >= this.cfg.ausenciaResetMs) {
      this.descansar()
    }

    let avisar = false
    if (presente && this.sentadoMs >= this.proximoAviso) {
      avisar = true
      this.proximoAviso = this.sentadoMs + this.cfg.repetirMs
    }
    return { presente, sentadoMs: this.sentadoMs, avisar }
  }

  /** Reinicia el contador (por ejemplo al tocar "Ya me levanté"). */
  descansar() {
    this.sentadoMs = 0
    this.proximoAviso = this.cfg.limiteMs
  }
}
