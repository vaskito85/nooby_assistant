import { describe, expect, it } from 'vitest'
// @ts-ignore — módulo .mjs del servidor, sin tipos
import { charlar, herramientasPara, HERRAMIENTAS, MODELO_POR_DEFECTO, MODELOS_ALTERNATIVOS, paramsRazonamiento } from '../servidor/ia.mjs'

const nombres = (ts: Array<{ function: { name: string } }>) => ts.map((t) => t.function.name)
const ctx = { nombre: 'Ger', ciudad: 'X', ahora: new Date(2026, 10, 27, 18, 0), sentadoMin: 0 }
const ok = (content: string) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '', json: async () => ({ choices: [{ message: { content } }] }) })

describe('herramientasPara (solo las que tienen que ver, para gastar menos tokens)', () => {
  it('la agenda va siempre', () => {
    const n = nombres(herramientasPara(['hola, cómo andás']))
    expect(n).toEqual(expect.arrayContaining(['poner_temporizador', 'crear_recordatorio', 'ver_agenda', 'cancelar_agenda']))
    expect(n).not.toContain('ver_clima')
    expect(n).not.toContain('lista_agregar')
    expect(n.length).toBe(4)
  })
  it('suma las de listas, clima, impresoras, bitácora y uso según el tema', () => {
    expect(nombres(herramientasPara(['armame una lista de compras']))).toContain('lista_agregar')
    expect(nombres(herramientasPara(['qué temperatura hace']))).toContain('ver_clima')
    expect(nombres(herramientasPara(['cómo va la H2C']))).toContain('ver_impresoras')
    expect(nombres(herramientasPara(['qué hablamos ayer']))).toContain('leer_bitacora')
    expect(nombres(herramientasPara(['acordate de que mi hermano se llama Pablo']))).toContain('recordar_dato')
    expect(nombres(herramientasPara(['cuántos tokens llevo']))).toContain('ver_uso')
  })
  it('manda bastante menos que todas juntas', () => {
    expect(herramientasPara(['hola']).length).toBeLessThan(HERRAMIENTAS.length / 2)
    expect(JSON.stringify(herramientasPara(['hola'])).length).toBeLessThan(JSON.stringify(HERRAMIENTAS).length / 2)
  })
  it('toda herramienta pedida existe', () => {
    for (const t of ['lista', 'clima', 'impresora', 'bitácora', 'acordate', 'tokens']) {
      for (const h of herramientasPara([t])) expect(h.function.name).toBeTruthy()
    }
    expect(nombres(HERRAMIENTAS)).toEqual(expect.arrayContaining(['lista_agregar', 'lista_ver', 'lista_marcar', 'lista_quitar', 'lista_reordenar', 'lista_borrar']))
  })
})

describe('modelos', () => {
  it('el principal es qwen y gpt-oss quedan de respaldo', () => {
    expect(MODELO_POR_DEFECTO).toBe('qwen/qwen3.8-27b')
    expect(MODELOS_ALTERNATIVOS[0]).toBe(MODELO_POR_DEFECTO)
    expect(MODELOS_ALTERNATIVOS).toEqual(expect.arrayContaining(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']))
  })
  it('razonamiento: qwen se apaga, gpt-oss poco y escondido, el resto nada', () => {
    expect(paramsRazonamiento('qwen/qwen3.8-27b', 0)).toEqual({ reasoning_effort: 'none' })
    expect(paramsRazonamiento('qwen/qwen3.8-27b', 1)).toEqual({ reasoning_format: 'hidden' })
    expect(paramsRazonamiento('qwen/qwen3.8-27b', 2)).toEqual({})
    expect(paramsRazonamiento('openai/gpt-oss-120b', 0)).toEqual({ reasoning_effort: 'low', include_reasoning: false })
    expect(paramsRazonamiento('openai/gpt-oss-120b', 2)).toEqual({})
    expect(paramsRazonamiento('otro', 0)).toEqual({})
  })
})

describe('charlar con qwen', () => {
  it('si la API rechaza un parámetro, prueba el siguiente (none → hidden → nada → sin herramientas)', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    let n = 0
    const fetchFn = async (_u: string, init: { body: string }) => {
      cuerpos.push(JSON.parse(init.body))
      if (n++ < 3) return { ok: false, status: 400, headers: { get: () => null }, text: async () => '{"error":{"message":"parametro no soportado"}}', json: async () => ({}) }
      return ok('Hola.')
    }
    const r = await charlar({ clave: 'k', modelo: 'qwen/qwen3.8-27b', soloEste: true, historial: [{ role: 'user', content: 'hola' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })
    expect(r.texto).toBe('Hola.')
    expect(cuerpos[0].reasoning_effort).toBe('none')
    expect(cuerpos[1].reasoning_format).toBe('hidden')
    expect(cuerpos[1].reasoning_effort).toBeUndefined()
    expect(cuerpos[2].reasoning_effort).toBeUndefined()
    expect(cuerpos[2].tools).toBeDefined()
    expect(cuerpos[3].tools).toBeUndefined()
  })

  it('manda solo las herramientas del tema', async () => {
    let cuerpo: { tools: Array<{ function: { name: string } }> } | null = null
    const fetchFn = async (_u: string, init: { body: string }) => {
      cuerpo = JSON.parse(init.body)
      return ok('Listo.')
    }
    await charlar({ clave: 'k', modelo: 'qwen/qwen3.8-27b', historial: [{ role: 'user', content: 'armame una lista de compras' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })
    const n = nombres(cuerpo!.tools)
    expect(n).toContain('lista_agregar')
    expect(n).not.toContain('ver_clima')
  })

  it('soloEste no cambia de modelo aunque falle', async () => {
    const modelos: string[] = []
    const fetchFn = async (_u: string, init: { body: string }) => {
      modelos.push(JSON.parse(init.body).model)
      return { ok: false, status: 429, headers: { get: () => null }, text: async () => '{"error":{"message":"cupo"}}', json: async () => ({}) }
    }
    await expect(charlar({ clave: 'k', modelo: 'qwen/qwen3.8-27b', soloEste: true, historial: [{ role: 'user', content: 'hola' }], contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({ tipo: 'cupo' })
    expect(new Set(modelos)).toEqual(new Set(['qwen/qwen3.8-27b']))
  })
})
