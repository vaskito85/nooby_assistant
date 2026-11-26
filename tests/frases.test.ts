import { describe, expect, it } from 'vitest'
import {
  chiste,
  CHISTES,
  fechaHablada,
  horaHablada,
  queEstoyHaciendo,
  saludoSegunHora,
  siguenImprimiendo,
} from '../src/lib/respuestas'
import { CATALOGO, interpretar } from '../src/lib/voz'

describe('CATALOGO: todo lo que se anuncia, se entiende', () => {
  // Esto es lo que se lista en el panel: si una frase de ejemplo no se entendiera, el panel mentiría.
  for (const g of CATALOGO) {
    for (const ejemplo of g.ejemplos) {
      it(`«${ejemplo}» → ${g.orden}`, () => {
        expect(interpretar(ejemplo)).toBe(g.orden)
      })
    }
  }
  it('no hay dos grupos con la misma orden', () => {
    const ordenes = CATALOGO.map((g) => g.orden)
    expect(new Set(ordenes).size).toBe(ordenes.length)
  })
})

describe('frases pedidas por el usuario', () => {
  it('las del pedido original', () => {
    expect(interpretar('que hora es')).toBe('hora')
    expect(interpretar('como esta el clima')).toBe('clima')
    expect(interpretar('que temperatura hace')).toBe('clima')
    expect(interpretar('dime el estado de las impresoras')).toBe('impresoras')
    expect(interpretar('que estas haciendo')).toBe('queHaces')
  })
  it('con otras palabras alrededor', () => {
    expect(interpretar('nooby decime que hora es por favor')).toBe('hora')
    expect(interpretar('che me podes decir como esta el clima hoy')).toBe('clima')
  })
})

describe('no se pisan entre sí', () => {
  it('"qué hacés" es charla pero "qué sabés hacer" es ayuda', () => {
    expect(interpretar('que haces')).toBe('queHaces')
    expect(interpretar('que sabes hacer')).toBe('ayuda')
    expect(interpretar('que podes hacer')).toBe('ayuda')
  })
  it('"cómo está el clima" no es "cómo estás"', () => {
    expect(interpretar('como esta el clima')).toBe('clima')
    expect(interpretar('como estas')).toBe('comoEstas')
  })
  it('"chau" se despide y "gracias" agradece', () => {
    expect(interpretar('chau')).toBe('despedida')
    expect(interpretar('gracias')).toBe('chau')
  })
  it('lo que ya andaba sigue andando', () => {
    expect(interpretar('cuanto tiempo llevo sentado')).toBe('tiempoSentado')
    expect(interpretar('como van las impresoras')).toBe('impresoras')
    expect(interpretar('ya me levante')).toBe('levante')
  })
  it('lo que no conoce da null', () => {
    expect(interpretar('poneme una pizza')).toBeNull()
    expect(interpretar('')).toBeNull()
  })
})

describe('respuestas', () => {
  it('saludo según la hora', () => {
    expect(saludoSegunHora(8, 'Ger')).toBe('Buen día, Ger.')
    expect(saludoSegunHora(15, 'Ger')).toBe('Buenas tardes, Ger.')
    expect(saludoSegunHora(22, 'Ger')).toBe('Buenas noches, Ger.')
    expect(saludoSegunHora(3, 'Ger')).toBe('Buenas noches, Ger.')
  })
  it('la hora', () => {
    expect(horaHablada(15, 0)).toBe('Son las 15 en punto.')
    expect(horaHablada(15, 5)).toBe('Son las 15 y 5.')
  })
  it('la fecha', () => {
    const t = fechaHablada(new Date(2026, 10, 26)) // jueves 26 de noviembre de 2026
    expect(t).toMatch(/^Hoy es jueves 26 de noviembre\.$/)
  })
  it('qué impresoras siguen imprimiendo', () => {
    expect(siguenImprimiendo([])).toBe('')
    expect(siguenImprimiendo(['H2C'])).toBe('H2C sigue imprimiendo.')
    expect(siguenImprimiendo(['H2C', 'A1'])).toBe('H2C y A1 siguen imprimiendo.')
    expect(siguenImprimiendo(['H2C', 'A1', 'Ender'])).toBe('H2C, A1 y Ender siguen imprimiendo.')
  })
  it('"qué estás haciendo" cuenta lo que hace de verdad', () => {
    const t = queEstoyHaciendo({ sentadoMin: 12, imprimiendo: ['H2C'] }, () => 0)
    expect(t).toContain('Llevás 12 minutos sentado.')
    expect(t).toContain('H2C sigue imprimiendo.')
    expect(queEstoyHaciendo({ sentadoMin: 0, imprimiendo: [] }, () => 0)).toContain('no te veo')
  })
  it('el chiste elige uno de la lista y nunca se sale de rango', () => {
    expect(CHISTES).toContain(chiste(() => 0))
    expect(CHISTES).toContain(chiste(() => 0.9999))
    expect(CHISTES).toContain(chiste(() => 1)) // azar() nunca da 1, pero no debe romper
  })
})
