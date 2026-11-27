import { describe, expect, it } from 'vitest'
import { interpretar } from '../src/lib/voz'

// Frases de charla normal que NO son pedidos: antes algunas disparaban el menú de impresoras, el clima, etc.
// Ahora tienen que devolver null para que las conteste la IA.
describe('la charla no se confunde con pedidos', () => {
  const charla = [
    'tener una buena pagina de impresiones que puedan ver las cosas que hay y como podria venderlas y demas',
    'quiero mejorar mis impresiones para el año que viene',
    'quiero ver cómo mejorar mis impresiones',
    'estoy pensando en comprar otra impresora para el año que viene',
    'la impresora nueva me gusta mucho',
    'estoy sentado en el taller pensando en cosas',
    'ya está listo el proyecto de la semana pasada',
    'nada de eso me sirve',
    'a qué hora llega el repartidor mañana',
    'qué día vamos a imprimir la pieza grande',
    'me voy a ir a comprar filamento más tarde',
    'tomé una decisión importante sobre el negocio',
    'hace mucho calor en el taller y se me deforman las piezas',
    'no tengo el tiempo suficiente para terminar todo',
    'una vez más voy a intentar vender en internet',
    'hola quería contarte algo sobre mis planes del año que viene',
    'gracias por la idea, la voy a pensar con calma',
    'me levanté temprano para pensar en los objetivos',
  ]
  for (const f of charla) {
    it(`"${f.slice(0, 60)}"`, () => expect(interpretar(f)).toBeNull())
  }
})

describe('los pedidos cortos siguen andando', () => {
  const pedidos: [string, string][] = [
    ['cómo van las impresoras', 'impresoras'],
    ['dime el estado de las impresoras', 'impresoras'],
    ['qué está imprimiendo', 'impresoras'],
    ['cuánto falta', 'impresoras'],
    ['cómo está la impresora', 'impresoras'],
    ['qué hora es', 'hora'],
    ['che me podes decir qué hora es por favor', 'hora'],
    ['qué día es hoy', 'fecha'],
    ['cómo está el clima hoy', 'clima'],
    ['hace frío', 'clima'],
    ['ya me levanté', 'levante'],
    ['ya tomé agua', 'agua'],
    ['gracias', 'chau'],
    ['listo gracias', 'chau'],
    ['chau', 'despedida'],
    ['hola', 'saludo'],
    ['cómo estás', 'comoEstas'],
    ['poneme un temporizador de cinco minutos para que no se me pasen los huevos', 'temporizador'],
    ['recordame mañana a las nueve que tengo que llamar al contador del taller', 'recordatorio'],
  ]
  for (const [f, orden] of pedidos) {
    it(`"${f}" → ${orden}`, () => expect(interpretar(f)).toBe(orden))
  }
})
