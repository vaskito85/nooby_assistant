// Sonido y voz. Los navegadores exigen un toque del usuario antes de dejar sonar: ver desbloquear().

let ctx: AudioContext | null = null

export function desbloquear() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  // Un "susurro" vacío por si el navegador también bloquea la voz hasta el primer uso.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

function nota(freq: number, inicio: number, dur: number, vol = 0.35) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + inicio)
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + inicio + 0.02)
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + inicio + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + inicio)
  o.stop(ctx.currentTime + inicio + dur + 0.05)
}

export type Sonido = 'suave' | 'alarma'

export function sonar(tipo: Sonido) {
  if (tipo === 'suave') {
    nota(660, 0, 0.18)
    nota(880, 0.2, 0.3)
  } else {
    for (let i = 0; i < 3; i++) {
      nota(988, i * 0.45, 0.18, 0.5)
      nota(740, i * 0.45 + 0.2, 0.18, 0.5)
    }
  }
}

/** Puente que expone el APK: el WebView de Android no trae voz propia, así que usa el TextToSpeech del sistema. */
declare global {
  interface Window {
    NoobyNativo?: {
      hablar(texto: string): void
      callar(): void
      /** "llamado" = solo espera "che nooby"; "libre" = entiende lo que se le pide. (APK 0.3.2 o más nuevo) */
      modoOido?(modo: 'llamado' | 'libre', gramatica?: string): void
      /** 2 = acepta la gramática y permite entrenar la frase de despertar (APK 0.4.0 o más nuevo). */
      apiVersion?(): number
    }
  }
}

export function callar() {
  window.NoobyNativo?.callar()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}

export function hablar(texto: string) {
  // La cara mueve la boca siguiendo las letras de lo que se va a decir.
  window.dispatchEvent(new CustomEvent('nooby-habla', { detail: texto }))
  if (window.NoobyNativo) {
    window.NoobyNativo.hablar(texto)
    return
  }
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = 'es-AR'
  const voces = speechSynthesis.getVoices()
  const v = voces.find((x) => x.lang === 'es-AR') ?? voces.find((x) => x.lang.startsWith('es'))
  if (v) u.voice = v
  speechSynthesis.speak(u)
}
