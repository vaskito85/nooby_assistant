// @ts-ignore — módulos de node (el proyecto no trae @types/node)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
// @ts-ignore
import { tmpdir } from 'node:os'
// @ts-ignore
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-ignore — módulos .mjs del servidor, sin tipos
import { charlar, transcribir } from '../servidor/ia.mjs'
// @ts-ignore
import { crearUso, esperaDe, leerLimites } from '../servidor/uso.mjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Buffer = (globalThis as any).Buffer

let carpeta = ''
let ahora = new Date(2026, 10, 27, 18, 0)
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'nooby-uso-'))
  ahora = new Date(2026, 10, 27, 18, 0)
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))
const nuevo = () => crearUso(join(carpeta, 'uso.json'), { ahora: () => ahora })

const cabeceras = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('esperaDe', () => {
  it('saca cuánto hay que esperar del aviso de Groq', () => {
    expect(esperaDe('Rate limit reached ... Please try again in 7m12.5s. Need more tokens?')).toBe(8)
    expect(esperaDe('Please try again in 1h2m3s')).toBe(63)
    expect(esperaDe('Please try again in 45s')).toBe(1)
    expect(esperaDe('otro mensaje')).toBeNull()
    expect(esperaDe(undefined)).toBeNull()
  })
})

describe('leerLimites', () => {
  it('lee los encabezados de cupo de Groq', () => {
    const l = leerLimites(
      cabeceras({
        'x-ratelimit-limit-requests': '1000',
        'x-ratelimit-remaining-requests': '940',
        'x-ratelimit-limit-tokens': '8000',
        'x-ratelimit-remaining-tokens': '7100',
        'x-ratelimit-reset-requests': '1m30s',
      }),
    )
    expect(l).toMatchObject({ pedidosLimite: 1000, pedidosQuedan: 940, tokensLimite: 8000, tokensQuedan: 7100, reinicioPedidos: '1m30s' })
  })
  it('sin encabezados devuelve null', () => {
    expect(leerLimites(cabeceras({}))).toBeNull()
    expect(leerLimites(undefined)).toBeNull()
  })
})

describe('uso', () => {
  it('suma pedidos y tokens del día y guarda lo que informa Groq', () => {
    const u = nuevo()
    u.registrar({ tipo: 'chat', modelo: 'm1', usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 }, headers: cabeceras({ 'x-ratelimit-remaining-tokens': '5000' }) })
    u.registrar({ tipo: 'chat', modelo: 'm1', usage: { prompt_tokens: 2000, completion_tokens: 150 } })
    u.registrar({ tipo: 'stt', modelo: 'w', segundos: 6.5 })
    const r = u.resumen()
    expect(r.hoy.chat).toMatchObject({ pedidos: 2, entrada: 3000, salida: 200 })
    expect(r.hoy.modelos.m1).toEqual({ pedidos: 2, tokens: 3200 })
    expect(r.hoy.stt).toMatchObject({ pedidos: 1, segundos: 6.5 })
    expect(r.limites.chat.tokensQuedan).toBe(5000)
  })

  it('anota los avisos de cupo con el detalle y la espera', () => {
    const u = nuevo()
    u.registrarError({ tipo: 'chat', modelo: 'm1', kind: 'cupo', detalle: 'Rate limit reached for model m1 (TPD). Please try again in 3m10s.' })
    u.registrarError({ tipo: 'chat', modelo: 'm1', kind: 'red', detalle: 'sin conexión' })
    const r = u.resumen()
    expect(r.hoy.chat).toMatchObject({ errores: 2, cupo: 1 })
    expect(r.ultimoCupo).toMatchObject({ tipo: 'chat', modelo: 'm1', esperaMin: 4 })
    expect(r.ultimoCupo.detalle).toContain('TPD')
    expect(r.ultimoError).toMatchObject({ kind: 'red' })
  })

  it('separa los días, sigue en el archivo y se recupera al reiniciar', () => {
    const u = nuevo()
    u.registrar({ tipo: 'chat', modelo: 'm', usage: { prompt_tokens: 10, completion_tokens: 5 } })
    ahora = new Date(2026, 10, 28, 9, 0)
    u.registrar({ tipo: 'chat', modelo: 'm', usage: { prompt_tokens: 20, completion_tokens: 5 } })
    const otra = nuevo() // como si se reiniciara el servidor
    const r = otra.resumen()
    expect(r.dias.map((d: { dia: string }) => d.dia)).toEqual(['2026-11-28', '2026-11-27'])
    expect(r.hoy.chat.entrada).toBe(20)
    expect(JSON.parse(readFileSync(join(carpeta, 'uso.json'), 'utf8')).dias['2026-11-27'].chat.entrada).toBe(10)
  })

  it('un día sin uso da ceros y un archivo roto empieza de cero', () => {
    expect(nuevo().resumen().hoy.chat).toEqual({ pedidos: 0, entrada: 0, salida: 0, errores: 0, cupo: 0 })
  })

  it('guarda solo los últimos 60 días', () => {
    const u = nuevo()
    for (let i = 0; i < 65; i++) {
      ahora = new Date(2026, 0, 1 + i)
      u.registrar({ tipo: 'chat', modelo: 'm', usage: { prompt_tokens: 1, completion_tokens: 1 } })
    }
    const dias = Object.keys(JSON.parse(readFileSync(join(carpeta, 'uso.json'), 'utf8')).dias)
    expect(dias.length).toBe(60)
  })
})

describe('charlar registra el uso y cambia de modelo si a uno se le acaba el cupo', () => {
  const historial = [{ role: 'user', content: 'hola' }]
  const ctx = { nombre: 'Ger', ciudad: 'X', ahora: new Date(2026, 10, 27, 18, 0), sentadoMin: 0 }

  it('avisa los tokens que gastó cada pedido', async () => {
    const usos: unknown[] = []
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      headers: cabeceras({ 'x-ratelimit-remaining-requests': '99' }),
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'Hola.' } }], usage: { prompt_tokens: 500, completion_tokens: 20, total_tokens: 520 } }),
    })
    await charlar({ clave: 'k', modelo: 'openai/gpt-oss-120b', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn, alUso: (u: unknown) => usos.push(u) })
    expect(usos).toHaveLength(1)
    expect(usos[0]).toMatchObject({ tipo: 'chat', modelo: 'openai/gpt-oss-120b', usage: { total_tokens: 520 } })
  })

  it('si al modelo se le acabó el cupo (429), usa otro y lo avisa', async () => {
    const modelos: string[] = []
    const errores: unknown[] = []
    const fetchFn = async (_u: string, init: { body: string }) => {
      const m = JSON.parse(init.body).model as string
      modelos.push(m)
      if (m === 'openai/gpt-oss-120b') {
        return { ok: false, status: 429, headers: cabeceras({ 'retry-after': '120' }), text: async () => '{"error":{"message":"Rate limit reached (TPD). Please try again in 2m."}}', json: async () => ({}) }
      }
      return { ok: true, status: 200, headers: cabeceras({}), text: async () => '', json: async () => ({ choices: [{ message: { content: 'Hola.' } }] }) }
    }
    const r = await charlar({ clave: 'k', modelo: 'openai/gpt-oss-120b', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn, alError: (e: unknown) => errores.push(e) })
    expect(r.texto).toBe('Hola.')
    expect(r.modelo).not.toBe('openai/gpt-oss-120b')
    expect(r.cambio).toBe('cupo')
    expect(modelos[0]).toBe('openai/gpt-oss-120b')
    expect(errores[0]).toMatchObject({ tipo: 'chat', modelo: 'openai/gpt-oss-120b', kind: 'cupo' })
  })

  it('si todos los modelos están sin cupo, el error de cupo trae el detalle', async () => {
    const fetchFn = async () => ({ ok: false, status: 429, headers: cabeceras({}), text: async () => '{"error":{"message":"Rate limit reached. Please try again in 9m."}}', json: async () => ({}) })
    await expect(charlar({ clave: 'k', historial, contexto: ctx, ejecutar: async () => ({}), fetchFn })).rejects.toMatchObject({ tipo: 'cupo', detalle: expect.stringContaining('9m') })
  })

  it('Whisper también informa los segundos de audio', async () => {
    const usos: unknown[] = []
    const fetchFn = async () => ({ ok: true, status: 200, headers: cabeceras({}), text: async () => '', json: async () => ({ text: 'Hola' }) })
    await transcribir({ clave: 'k', pcm: Buffer.alloc(32000 * 3), fetchFn, alUso: (u: unknown) => usos.push(u) })
    expect(usos[0]).toMatchObject({ tipo: 'stt', segundos: 3 })
  })
})
