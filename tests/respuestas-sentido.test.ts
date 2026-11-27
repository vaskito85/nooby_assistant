import { describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { charlar, limpiarRespuesta, sinRepetidas } from '../servidor/ia.mjs'
import { interpretar } from '../src/lib/voz'

// Casos sacados de la bitácora real: respuestas pegadas, repetidas, y un "listo" sin haber hecho nada.
describe('limpiarRespuesta arregla lo que se vio en la bitácora', () => {
  it('separa las frases que el modelo pegó sin espacio', () => {
    expect(limpiarRespuesta('¿Querés que te ayude con el temporizador?Decime cuánto dura cada impresión.')).toBe(
      '¿Querés que te ayude con el temporizador? Decime cuánto dura cada impresión.',
    )
  })

  it('no repite lo mismo dos veces con otras palabras', () => {
    const t =
      'Me dice que la lista está: primero imprimir lámparas para venderlas, después limpiar el taller. Listo, la lista quedó así: primero imprimir lámparas para venderlas, luego limpiar el taller.'
    expect(limpiarRespuesta(t)).toBe('Me dice que la lista está: primero imprimir lámparas para venderlas, después limpiar el taller.')
  })

  it('deja dos frases distintas', () => {
    const t = 'Listo, quedó anotado: imprimir lámparas y limpiar el taller. Todo anotado, listo para la lista.'
    expect(limpiarRespuesta(t)).toBe(t)
  })

  it('sinRepetidas no toca frases cortas ni distintas', () => {
    expect(sinRepetidas('Sí. Dale.')).toBe('Sí. Dale.')
    expect(sinRepetidas('Hace treinta grados. Hay sol y poco viento.')).toBe('Hace treinta grados. Hay sol y poco viento.')
  })
})

describe('recordatorios dichos como en la bitácora', () => {
  it('"recordámelo mañana" es un recordatorio (no va a la IA)', () => {
    expect(interpretar('Recuerda, recordámelo mañana, por favor.')).toBe('recordatorio')
    expect(interpretar('recordalo mañana a las nueve')).toBe('recordatorio')
    expect(interpretar('acordate de que tengo que limpiar el taller')).toBe('recordatorio')
    expect(interpretar('haceme acordar mañana de llamar al contador')).toBe('recordatorio')
  })
})

describe('la IA no dice "listo" sin haber hecho nada', () => {
  const ctx = { nombre: 'Ger', ciudad: 'X', ahora: new Date(2026, 10, 27, 18, 0), sentadoMin: 0 }
  const resp = (message: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '', json: async () => ({ choices: [{ message }] }) })

  it('si dice que lo recordó sin llamar la herramienta, se le avisa y la llama', async () => {
    const pedidos: Array<{ messages: Array<{ role: string; content: string }> }> = []
    const respuestas = [
      resp({ content: 'Listo, te recuerdo mañana.' }), // miente: no llamó nada
      resp({ content: null, tool_calls: [{ id: 't1', function: { name: 'crear_recordatorio', arguments: '{"texto":"limpiar el taller","en_minutos":600}' } }] }),
      resp({ content: 'Listo, mañana te aviso de limpiar el taller.' }),
    ]
    let i = 0
    const fetchFn = async (_u: string, init: { body: string }) => {
      pedidos.push(JSON.parse(init.body))
      return respuestas[i++]
    }
    const llamadas: string[] = []
    const r = await charlar({
      clave: 'k',
      modelo: 'm',
      historial: [{ role: 'user', content: 'recordámelo mañana: tengo que limpiar el taller' }],
      contexto: ctx,
      ejecutar: async (n: string) => {
        llamadas.push(n)
        return { ok: true }
      },
      fetchFn,
    })
    expect(llamadas).toEqual(['crear_recordatorio'])
    expect(r.texto).toBe('Listo, mañana te aviso de limpiar el taller.')
    expect(pedidos[1].messages.at(-1)?.content).toContain('No llamaste ninguna herramienta')
  })

  it('el aviso se hace una sola vez', async () => {
    let n = 0
    const fetchFn = async () => {
      n++
      return resp({ content: 'Listo, anotado.' })
    }
    const r = await charlar({ clave: 'k', modelo: 'm', historial: [{ role: 'user', content: 'anotá que tengo turno' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('Listo, anotado.')
    expect(n).toBe(2) // el pedido original + un solo reintento
  })

  it('una charla normal no recibe el aviso', async () => {
    let n = 0
    const fetchFn = async () => {
      n++
      return resp({ content: 'Listo, contame más.' })
    }
    await charlar({ clave: 'k', modelo: 'm', historial: [{ role: 'user', content: 'hoy fue un día largo en el taller' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(n).toBe(1)
  })

  it('si preguntó lo que faltaba (no dijo que estuviera hecho) tampoco', async () => {
    let n = 0
    const fetchFn = async () => {
      n++
      return resp({ content: '¿Para cuándo querés que te lo recuerde?' })
    }
    const r = await charlar({ clave: 'k', modelo: 'm', historial: [{ role: 'user', content: 'recordame limpiar el taller' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('¿Para cuándo querés que te lo recuerde?')
    expect(n).toBe(1)
  })
})
