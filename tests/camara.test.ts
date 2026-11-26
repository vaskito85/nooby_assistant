import { describe, expect, it } from 'vitest'
import { elegirImpresora, type Impresora } from '../src/lib/impresoras'
import { interpretar } from '../src/lib/voz'

const LISTA: Impresora[] = [
  { nombre: 'Bambu H2C', estado: 'imprimiendo' },
  { nombre: 'Bambu A1', estado: 'terminada' },
  { nombre: 'Neptune 4', estado: 'libre' },
]
const quien = (t: string) => elegirImpresora(t, LISTA)

describe('interpretar: pedir ver una impresora', () => {
  it('lo entiende de varias formas', () => {
    for (const t of ['mostrame la impresora', 'mostrame la H2C', 'foto de la A1', 'quiero ver la cámara de la impresora', 'qué se ve en la impresora', 'sacale una foto a la impresora', 'ver la H2C']) {
      expect(interpretar(t), t).toBe('verCamara')
    }
  })
  it('"el estado" y "cómo van" siguen siendo el estado de las impresoras', () => {
    for (const t of ['dime el estado de las impresoras', 'cómo van las impresoras', 'cuánto falta', 'qué está imprimiendo', 'ver el estado de las impresoras']) {
      expect(interpretar(t), t).toBe('impresoras')
    }
  })
  it('no confunde otros pedidos', () => {
    expect(interpretar('mostrame el clima')).toBe('clima')
    expect(interpretar('qué hora es')).toBe('hora')
  })
})

describe('elegirImpresora (por el nombre hablado)', () => {
  it('por el nombre escrito', () => {
    expect(quien('mostrame la h2c')?.impresora.nombre).toBe('Bambu H2C')
    expect(quien('foto de la a1')?.impresora.nombre).toBe('Bambu A1')
    expect(quien('mostrame la neptune')?.impresora.nombre).toBe('Neptune 4')
  })
  it('por cómo lo escribe el reconocedor: letras y números hablados', () => {
    expect(quien('mostrame la hache dos ce')?.impresora.nombre).toBe('Bambu H2C')
    expect(quien('foto de la a uno')?.impresora.nombre).toBe('Bambu A1')
    expect(quien('mostrame la neptuno cuatro')?.impresora.nombre).toBe('Neptune 4')
  })
  it('lo marca como elegida por nombre', () => {
    expect(quien('mostrame la a1')?.porNombre).toBe(true)
  })
  it('"bambu" solo no alcanza: lo comparten dos impresoras', () => {
    const e = quien('mostrame la bambu')
    expect(e?.porNombre).toBe(false)
  })
  it('sin nombrar ninguna: la que está imprimiendo', () => {
    const e = quien('mostrame la impresora')
    expect(e?.impresora.nombre).toBe('Bambu H2C')
    expect(e?.porNombre).toBe(false)
  })
  it('sin ninguna imprimiendo: la primera', () => {
    const e = elegirImpresora('mostrame la impresora', [
      { nombre: 'Bambu A1', estado: 'libre' },
      { nombre: 'Neptune 4', estado: 'libre' },
    ])
    expect(e?.impresora.nombre).toBe('Bambu A1')
  })
  it('sin impresoras no hay nada que elegir', () => {
    expect(elegirImpresora('mostrame la h2c', [])).toBeNull()
  })
})
