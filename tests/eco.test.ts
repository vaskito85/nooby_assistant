import { describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { limpiarRespuesta, MAX_VOZ, normalizarPcm } from '../servidor/ia.mjs'
import { quitarEco } from '../src/lib/eco'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Buffer = (globalThis as any).Buffer

describe('quitarEco', () => {
  const nooby = ['Hace treinta y cuatro grados. Todavía no puedo poner música, pero puedo ayudarte con otra cosa.']

  it('saca lo que es lo mismo que dijo Nooby y deja lo tuyo', () => {
    expect(quitarEco('Bueno gracias. Todavía no puedo poner música pero puedo ayudarte con otra cosa.', nooby)).toBe('Bueno gracias.')
  })
  it('si todo es eco devuelve vacío', () => {
    expect(quitarEco('Hace treinta y cuatro grados.', nooby)).toBe('')
  })
  it('lo que decís vos queda, aunque comparta alguna palabra', () => {
    expect(quitarEco('¿Y mañana va a hacer calor también?', nooby)).toBe('¿Y mañana va a hacer calor también?')
    expect(quitarEco('Poneme música', nooby)).toBe('Poneme música')
  })
  it('las frases cortas nunca se toman por eco', () => {
    expect(quitarEco('Sí. Dale.', ['Sí. Dale.'])).toBe('Sí. Dale.')
  })
  it('sin nada que comparar devuelve lo oído', () => {
    expect(quitarEco('hola che', [])).toBe('hola che')
    expect(quitarEco('hola che', [''])).toBe('hola che')
  })
})

describe('limpiarRespuesta (lo que Nooby dice en voz alta)', () => {
  it('descarta el razonamiento que se cuela en la respuesta', () => {
    expect(limpiarRespuesta('Okay, we need to respond correctly. The user asked "¿Qué temperatura hace?"')).toBe('')
    expect(limpiarRespuesta('Let\'s answer: Hace treinta grados.')).toBe('')
  })
  it('saca las rayas de puntos', () => {
    expect(limpiarRespuesta('Hace 34 grados … ……… …… … ... . Y hay sol.')).toBe('Hace 34 grados. Y hay sol.')
  })
  it('un texto normal pasa tal cual', () => {
    expect(limpiarRespuesta('Hace treinta y cuatro grados. Hay llovizna.')).toBe('Hace treinta y cuatro grados. Hay llovizna.')
  })
  it('corta las respuestas largas en un final de frase', () => {
    const largo = Array.from({ length: 30 }, (_, i) => `Esta es la frase número ${i} de una respuesta demasiado larga.`).join(' ')
    const r = limpiarRespuesta(largo)
    expect(r.length).toBeLessThanOrEqual(MAX_VOZ)
    expect(r.endsWith('.')).toBe(true)
  })
})

describe('normalizarPcm', () => {
  const pcm = (valores: number[]) => {
    const b = Buffer.alloc(valores.length * 2)
    valores.forEach((v, i) => b.writeInt16LE(v, i * 2))
    return b
  }
  it('sube el volumen del audio bajito hasta ~80 % del máximo', () => {
    const r = normalizarPcm(pcm([1000, -2000, 500]))
    const pico = Math.max(...[0, 1, 2].map((i) => Math.abs(r.readInt16LE(i * 2))))
    expect(pico).toBeGreaterThan(8000)
    expect(pico).toBeLessThanOrEqual(32767)
    expect(r.readInt16LE(0)).toBeGreaterThan(0) // conserva el signo y las proporciones
    expect(r.readInt16LE(2)).toBeLessThan(0)
  })
  it('no infla el silencio ni toca el audio que ya suena fuerte', () => {
    const silencio = pcm([10, -20, 5])
    expect(normalizarPcm(silencio)).toBe(silencio)
    const fuerte = pcm([26000, -25000, 100])
    expect(normalizarPcm(fuerte)).toBe(fuerte)
  })
  it('la ganancia tiene tope', () => {
    const r = normalizarPcm(pcm([300, -300]))
    expect(r.readInt16LE(0)).toBeLessThanOrEqual(300 * 8 + 1)
  })
})
