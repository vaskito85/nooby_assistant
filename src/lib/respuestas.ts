// Lo que Nooby contesta en la charla. Lógica pura (sin DOM): el azar se recibe por parámetro para poder probarla.

export type Azar = () => number

const elegir = <T>(lista: T[], azar: Azar): T => lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))]

/** "Buen día, Ger." / "Buenas tardes, Ger." / "Buenas noches, Ger." según la hora. */
export function saludoSegunHora(hora: number, nombre: string): string {
  const s = hora >= 6 && hora < 12 ? 'Buen día' : hora >= 12 && hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  return `${s}, ${nombre}.`
}

/** "Hoy es jueves 26 de noviembre." */
export function fechaHablada(fecha: Date): string {
  const t = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
  return `Hoy es ${t}.`
}

/** "Son las 15 en punto." / "Son las 15 y 5." */
export function horaHablada(hora: number, minutos: number): string {
  return minutos === 0 ? `Son las ${hora} en punto.` : `Son las ${hora} y ${minutos}.`
}

/** "H2C sigue imprimiendo." / "H2C y A1 siguen imprimiendo." / "H2C, A1 y Ender siguen imprimiendo." */
export function siguenImprimiendo(nombres: string[]): string {
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return `${nombres[0]} sigue imprimiendo.`
  const ultimo = nombres[nombres.length - 1]
  return `${nombres.slice(0, -1).join(', ')} y ${ultimo} siguen imprimiendo.`
}

/** Respuesta a "¿qué estás haciendo?": lo que hace de verdad (te mira, cuenta el tiempo, vigila las impresoras). */
export function queEstoyHaciendo(datos: { sentadoMin: number; imprimiendo: string[] }, azar: Azar = Math.random): string {
  const base = elegir(
    ['Acá estoy, cuidándote mientras trabajás.', 'Mirándote trabajar y contando los minutos.', 'Vigilando que no te olvides de descansar.'],
    azar,
  )
  const sentado = datos.sentadoMin > 0 ? ` Llevás ${datos.sentadoMin} minutos sentado.` : ' Ahora no te veo por acá.'
  const imp = datos.imprimiendo.length > 0 ? ` ${siguenImprimiendo(datos.imprimiendo)}` : ''
  return base + sentado + imp
}

export const comoEstoy = (nombre: string, azar: Azar = Math.random) =>
  elegir(['Muy bien, gracias. ¿Y vos?', `Todo bien por acá. ¿Y vos, ${nombre}?`, 'Con la batería llena y las ganas intactas. ¿Y vos?'], azar)

export const quienSoy = () =>
  'Soy Nooby, tu asistente de escritorio. Te cuido mientras trabajás y te aviso cuando pasa algo con las impresoras.'

export const estoyAhi = (nombre: string, azar: Azar = Math.random) =>
  elegir([`Acá estoy, ${nombre}.`, 'Presente.', `Sí, ${nombre}, te escucho.`], azar)

export const estoyCansado = () =>
  'Si estás cansado, pará un rato: levantate, estirá las piernas y tomá agua. Yo cuento el descanso.'

export const despedida = (nombre: string, azar: Azar = Math.random) =>
  elegir([`Chau, ${nombre}. ¡Nos vemos!`, 'Hasta luego. Yo me quedo vigilando.', `Que descanses, ${nombre}.`], azar)

export const CHISTES = [
  '¿Sabés por qué las impresoras 3D nunca tienen frío? Porque siempre están calentando la cama.',
  'Un programador entra a un bar y pide una cerveza. Pide dos cervezas. Pide cero cervezas. Pide un lagarto.',
  '¿Qué le dijo un filamento a otro? Nada, estaban enredados.',
  'Mi impresora y yo nos entendemos: ella imprime, y yo rezo.',
  '¿Cuál es el colmo de una impresora 3D? Tener la cama despegada y no poder dormir.',
]

export const chiste = (azar: Azar = Math.random) => elegir(CHISTES, azar)
