import { describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { charlar, ErrorIA, instrucciones, limpiarMensajes, limpiarRespuesta } from '../servidor/ia.mjs'

const ctx = { nombre: 'Ger', ciudad: 'Bahía Blanca', ahora: new Date(2026, 10, 26, 18, 0), sentadoMin: 0 }

/** Un "fetch" de mentira que contesta lo que se le pase, en orden. */
function falso(respuestas: Array<{ status?: number; message?: unknown }>) {
  const pedidos: Array<{ messages: Array<{ role: string; content: string }> }> = []
  let i = 0
  const fetchFn = async (_url: string, init: { body: string }) => {
    pedidos.push(JSON.parse(init.body))
    const r = respuestas[Math.min(i++, respuestas.length - 1)]
    return { ok: (r.status ?? 200) < 300, status: r.status ?? 200, json: async () => ({ choices: [{ message: r.message }] }) }
  }
  return { fetchFn, pedidos }
}

const historial = [{ role: 'user', content: 'hola' }]

describe('limpiarMensajes', () => {
  it('traduce roles y exige que termine en un mensaje del usuario', () => {
    expect(limpiarMensajes([{ rol: 'yo', texto: 'hola' }, { rol: 'nooby', texto: 'buenas' }, { rol: 'yo', texto: 'qué tal' }])).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
      { role: 'user', content: 'qué tal' },
    ])
    expect(limpiarMensajes([{ rol: 'yo', texto: 'hola' }, { rol: 'nooby', texto: 'buenas' }])).toEqual([])
  })
  it('descarta basura y arranca en un mensaje del usuario', () => {
    expect(limpiarMensajes([{ rol: 'nooby', texto: 'x' }, { rol: 'otro', texto: 'y' }, 5, null, { rol: 'yo', texto: '  ' }, { rol: 'yo', texto: 'ok' }])).toEqual([
      { role: 'user', content: 'ok' },
    ])
    expect(limpiarMensajes('nada')).toEqual([])
  })
  it('recorta textos largos y se queda con los últimos 12', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ rol: i % 2 ? 'nooby' : 'yo', texto: 'a'.repeat(900) }))
    const out = limpiarMensajes([...muchos, { rol: 'yo', texto: 'fin' }])
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out.every((m: { content: string }) => m.content.length <= 500)).toBe(true)
  })
})

describe('limpiarRespuesta', () => {
  it('saca markdown, emojis y viñetas para que se pueda leer en voz alta', () => {
    expect(limpiarRespuesta('**Hola** 😀 ¿qué `tal`?\n- uno\n- dos')).toBe('Hola ¿qué tal? uno dos')
    expect(limpiarRespuesta('<think>pienso</think>Listo')).toBe('Listo')
  })
})

describe('instrucciones', () => {
  it('incluye fecha, nombre, ciudad y la regla de hablar corto', () => {
    const t = instrucciones(ctx)
    expect(t).toContain('Ger')
    expect(t).toContain('Bahía Blanca')
    expect(t).toContain('2026')
    expect(t).toMatch(/frases cortas/)
  })
  it('menciona los minutos sentado solo si hay', () => {
    expect(instrucciones(ctx)).not.toContain('minutos sentado')
    expect(instrucciones({ ...ctx, sentadoMin: 70 })).toContain('70 minutos sentado')
  })
})

describe('charlar', () => {
  it('sin clave falla con sin_clave', async () => {
    await expect(charlar({ clave: '', historial, contexto: ctx, ejecutar: async () => ({}) })).rejects.toMatchObject({ tipo: 'sin_clave' })
  })

  it('contesta directo cuando no hay herramientas', async () => {
    const { fetchFn, pedidos } = falso([{ message: { content: 'Hola, Ger. ¿Cómo andás?' } }])
    const r = await charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('Hola, Ger. ¿Cómo andás?')
    expect(pedidos[0].messages[0].role).toBe('system')
    expect(pedidos[0].messages[1]).toEqual({ role: 'user', content: 'hola' })
  })

  it('ejecuta la herramienta y vuelve a preguntarle con el resultado', async () => {
    const { fetchFn, pedidos } = falso([
      { message: { content: null, tool_calls: [{ id: 'a1', function: { name: 'poner_temporizador', arguments: '{"minutos":10,"etiqueta":"huevos"}' } }] } },
      { message: { content: 'Listo, diez minutos para los huevos.' } },
    ])
    const llamadas: Array<[string, unknown]> = []
    const r = await charlar({
      clave: 'k',
      historial,
      contexto: ctx,
      ejecutar: async (n: string, a: unknown) => {
        llamadas.push([n, a])
        return { ok: true }
      },
      fetchFn,
    })
    expect(llamadas).toEqual([['poner_temporizador', { minutos: 10, etiqueta: 'huevos' }]])
    expect(r.texto).toBe('Listo, diez minutos para los huevos.')
    const segundo = pedidos[1].messages
    expect(segundo[segundo.length - 1]).toMatchObject({ role: 'tool', tool_call_id: 'a1', content: '{"ok":true}' })
  })

  it('si la herramienta falla, la IA recibe el error y puede explicarlo', async () => {
    const { fetchFn, pedidos } = falso([
      { message: { content: '', tool_calls: [{ id: 'b', function: { name: 'ver_clima', arguments: '{}' } }] } },
      { message: { content: 'No pude ver el clima.' } },
    ])
    const r = await charlar({
      clave: 'k',
      historial,
      contexto: ctx,
      ejecutar: async () => {
        throw new Error('sin internet')
      },
      fetchFn,
    })
    expect(r.texto).toBe('No pude ver el clima.')
    expect(pedidos[1].messages.at(-1)?.content).toContain('sin internet')
  })

  it('argumentos rotos no tiran todo abajo', async () => {
    const { fetchFn } = falso([
      { message: { tool_calls: [{ id: 'c', function: { name: 'ver_agenda', arguments: '{roto' } }] } },
      { message: { content: 'Ok.' } },
    ])
    expect((await charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).texto).toBe('Ok.')
  })

  it('corta si la IA se queda pidiendo herramientas para siempre', async () => {
    const { fetchFn, pedidos } = falso([{ message: { tool_calls: [{ id: 'd', function: { name: 'ver_agenda', arguments: '{}' } }] } }])
    await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toBeInstanceOf(ErrorIA)
    expect(pedidos.length).toBeLessThanOrEqual(4)
  })

  it('traduce los errores HTTP', async () => {
    for (const [status, tipo] of [[401, 'clave'], [429, 'cupo'], [500, 'ia']] as const) {
      const { fetchFn } = falso([{ status }])
      await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({ tipo })
    }
  })

  it('si la API rechaza la herramienta (400), reintenta ese turno sin herramientas', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    let n = 0
    const fetchFn = async (_u: string, init: { body: string }) => {
      cuerpos.push(JSON.parse(init.body))
      if (n++ === 0) return { ok: false, status: 400, text: async () => '{"error":{"message":"Failed to call a function"}}', json: async () => ({}) }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: 'Hola, soy Nooby.' } }] }) }
    }
    const r = await charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('Hola, soy Nooby.')
    expect(cuerpos[0].tools).toBeDefined()
    expect(cuerpos[1].tools).toBeUndefined()
  })

  it('si el modelo ya no existe (404), prueba otro y avisa cuál funcionó', async () => {
    const modelos: string[] = []
    const fetchFn = async (_u: string, init: { body: string }) => {
      const m = JSON.parse(init.body).model as string
      modelos.push(m)
      if (m === 'viejo-retirado') return { ok: false, status: 404, text: async () => '{"error":{"message":"The model does not exist"}}', json: async () => ({}) }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: 'Hola.' } }] }) }
    }
    const r = await charlar({ clave: 'k', modelo: 'viejo-retirado', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('Hola.')
    expect(modelos[0]).toBe('viejo-retirado')
    expect(r.modelo).toBe(modelos[1])
    expect(r.modelo).not.toBe('viejo-retirado')
  })

  it('un error HTTP trae el detalle que dijo la API', async () => {
    const fetchFn = async () => ({ ok: false, status: 404, text: async () => '{"error":{"message":"The model does not exist"}}', json: async () => ({}) })
    await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({
      tipo: 'ia',
      detalle: 'HTTP 404 The model does not exist',
    })
  })

  it('sin internet es un error de red', async () => {
    const fetchFn = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({ tipo: 'red' })
  })

  it('una respuesta vacía es un error, no silencio', async () => {
    const { fetchFn } = falso([{ message: { content: '  😀 ' } }])
    await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({ tipo: 'ia' })
  })
})
