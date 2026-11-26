import { describe, expect, it } from 'vitest'
import { duracionCorta, inferirEstado, ordenarPorRelevancia, resumenCorto, type Impresora } from '../src/lib/impresoras'
import { esConfirmacion } from '../src/lib/voz'

describe('inferirEstado (qué dibujo mostrar según el texto del aviso)', () => {
  it('terminó', () => {
    expect(inferirEstado('Che, la impresión terminó')).toBe('terminada')
    expect(inferirEstado('La H2C terminó el pedido')).toBe('terminada')
    expect(inferirEstado('Impresión lista en la A1')).toBe('terminada')
    expect(inferirEstado('Se completó la placa')).toBe('terminada')
  })
  it('falló o se cortó', () => {
    expect(inferirEstado('La impresión falló')).toBe('error')
    expect(inferirEstado('Se cortó la conexión con la A1')).toBe('error')
    expect(inferirEstado('Error en la H2C')).toBe('error')
  })
  it('pausa', () => {
    expect(inferirEstado('La impresión está en pausa')).toBe('pausa')
  })
  it('error gana si el texto dice las dos cosas', () => {
    expect(inferirEstado('Terminó con errores')).toBe('error')
  })
  it('sin pistas o empezó: imprimiendo', () => {
    expect(inferirEstado('Empezó la impresión de llaveros')).toBe('imprimiendo')
    expect(inferirEstado('Aviso de prueba')).toBe('imprimiendo')
  })
})

describe('ordenarPorRelevancia', () => {
  const p = (nombre: string, estado: Impresora['estado']): Impresora => ({ nombre, estado })
  it('errores primero, después pausas, imprimiendo, terminadas, sin conexión y libres', () => {
    const r = ordenarPorRelevancia([p('A', 'libre'), p('B', 'imprimiendo'), p('C', 'error'), p('D', 'pausa'), p('E', 'offline')])
    expect(r.map((x) => x.nombre)).toEqual(['C', 'D', 'B', 'E', 'A'])
  })
  it('mantiene el orden entre iguales y no modifica la lista original', () => {
    const original = [p('X', 'imprimiendo'), p('Y', 'imprimiendo'), p('Z', 'error')]
    expect(ordenarPorRelevancia(original).map((x) => x.nombre)).toEqual(['Z', 'X', 'Y'])
    expect(original.map((x) => x.nombre)).toEqual(['X', 'Y', 'Z'])
  })
})

describe('resumenCorto / duracionCorta', () => {
  it('formatea para pantalla', () => {
    expect(duracionCorta(35)).toBe('35 min')
    expect(duracionCorta(95)).toBe('1 h 35 min')
    expect(duracionCorta(120)).toBe('2 h')
    expect(duracionCorta(0)).toBe('<1 min')
  })
  it('una línea por impresora', () => {
    expect(resumenCorto({ nombre: 'H2C', estado: 'imprimiendo', progreso: 45, restanteMin: 95 })).toBe('imprimiendo · 45 % · faltan 1 h 35 min')
    expect(resumenCorto({ nombre: 'H2C', estado: 'imprimiendo' })).toBe('imprimiendo')
    expect(resumenCorto({ nombre: 'A1', estado: 'libre' })).toBe('libre')
    expect(resumenCorto({ nombre: 'A1', estado: 'error' })).toBe('con error')
  })
})

describe('esConfirmacion ("OK" por voz para cerrar el aviso)', () => {
  it('lo entiende', () => {
    for (const t of ['ok', 'OK', 'okey', 'listo', 'entendido', 'gracias', 'dale', 'ya está', 'callate']) {
      expect(esConfirmacion(t), t).toBe(true)
    }
  })
  it('no se cierra con otras cosas', () => {
    for (const t of ['', 'la impresora esta imprimiendo', 'que hora es', 'tokio', 'lista de compras']) {
      expect(esConfirmacion(t), t).toBe(false)
    }
  })
})
