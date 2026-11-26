# Integrar un agente (Raspberry / impresoras) con Nooby

Esta guía es para el agente que maneja las impresoras. Nooby es un asistente con cara que corre en un celu viejo conectado
por USB a una PC con Windows. Esa PC tiene un servidor de Nooby (`http://127.0.0.1:8777`). El agente de las impresoras vive en
**otra máquina** (la Raspberry) y le habla a ese servidor **por la red local**.

```
 Agente (Raspberry) ── HTTP + X-Token ──▶ servidor de Nooby (PC) ── cable USB ──▶ celu (la cara)
```

## Qué puede hacer el agente

| Para qué | Qué manda | Qué hace Nooby |
|---|---|---|
| **Avisar algo importante** (terminó, falló) | `POST /api/aviso` | Suena una alarma, la cara se pone en alerta y dice el texto en voz alta. Se repite hasta que el usuario toca "Entendido". |
| **Contar cómo están las impresoras** | `POST /api/impresoras` | Guarda el último informe. Si el usuario pregunta por voz ("che nooby, ¿cómo van las impresoras?" / "¿cuánto falta?") lo lee en voz alta. |

Nooby **no llama** al agente: consulta lo último que el agente le informó. (Si más adelante hacen falta órdenes hacia el agente,
por ejemplo "pausá la impresión", se define otro endpoint; hoy no existe.)

## Conexión

1. En la PC, abrir el panel de Nooby (`http://127.0.0.1:8777/#/panel`), sección **"4. Conectar la Raspberry y otras máquinas"**,
   y tocar **"Abrir el acceso desde la red"**. El panel muestra:
   - la **dirección**, por ejemplo `http://192.168.1.174:8777`,
   - el **token** (secreto).
2. Cargar esos dos datos en la configuración del agente, por ejemplo `nooby: { url, token }`. El token es un secreto: se guarda
   igual que los demás (cifrado), **nunca** en el repo, en logs, ni en mensajes.
3. Conviene fijar la IP de la PC en el router (reserva DHCP), porque si cambia, la dirección deja de servir.

Desde la red, el servidor **solo** acepta `POST /api/aviso` y `POST /api/impresoras`, y siempre con el token. Cualquier otra ruta
responde 403. No exponer el puerto a internet.

Si el token se filtra: "Generar token nuevo" en el panel y actualizarlo en el agente.

## `POST /api/aviso`

Encabezados: `Content-Type: application/json` y `X-Token: <token>`.

```json
{ "texto": "Che, la impresión terminó en la H2C" }
```

- `texto`: obligatorio, hasta 300 caracteres. Frase corta, en español rioplatense, tal como se tiene que decir en voz alta.
- Respuestas: `200 {"ok":true,"pantallas":1}` (`pantallas` = cuántas caras abiertas lo recibieron; 0 = el celu no está),
  `400` JSON inválido o falta `texto`, `401` token faltante o incorrecto, `415` falta `Content-Type: application/json`.

**Usarlo solo para lo importante** (terminó, falló, se cortó la conexión imprimiendo, pausa por error, rollo por acabarse).
Suena fuerte y se repite hasta que el usuario lo descarta: no mandar "empezó" ni avances por acá; para eso está `/api/impresoras`.
No repetir el mismo aviso.

## `POST /api/impresoras`

Mismos encabezados. Se manda **la lista completa** de impresoras cada vez (reemplaza el informe anterior).

```json
{
  "impresoras": [
    { "id": "h2c", "nombre": "H2C", "estado": "imprimiendo", "progreso": 45, "restanteMin": 95, "trabajo": "llaveros.3mf" },
    { "id": "a1", "nombre": "A1", "estado": "libre" }
  ]
}
```

| Campo | Obligatorio | Detalle |
|---|---|---|
| `nombre` | sí | Como se tiene que decir en voz alta ("H2C", "A1", "la Neptune"). Hasta 40 caracteres. |
| `estado` | sí | Uno de: `imprimiendo`, `libre`, `pausa`, `error`, `offline`, `terminada`. Otro valor: la impresora se ignora. |
| `progreso` | no | Número de 0 a 100. |
| `restanteMin` | no | Minutos que faltan (número ≥ 0). |
| `trabajo` | no | Nombre del trabajo (hasta 80 caracteres). |
| `id` | no | Identificador interno (hasta 40 caracteres). |

- Máximo 20 impresoras por informe. Respuesta `200 {"ok":true,"recibidas":2}`.
- **Cuándo mandarlo:** apenas cambia el estado de cualquier impresora, cada 30–60 segundos mientras alguna está imprimiendo,
  y cada 5 minutos como mínimo aunque no pase nada. **Un informe de más de 15 minutos se considera viejo** y Nooby contesta
  "No tengo datos recientes de las impresoras" en vez de decir algo que puede ser falso.
- No inventar datos: si no se conoce el avance o lo que falta, no mandar esos campos.

## Reglas para que no moleste al resto del agente

- **Es opcional y nunca bloquea.** Timeout de 3 segundos, un reintento como máximo. Si Nooby no responde (PC apagada, celu
  desconectado), seguir con Telegram y lo demás como si nada. No acumular una cola de avisos viejos: un aviso de hace una hora
  ya no sirve.
- Un error de Nooby se loguea en una línea, **sin el token** y sin cortar el flujo.
- Si el `nooby` no está configurado en el agente, no hacer nada.
- Mandar el aviso junto al de Telegram, no en lugar de él.

## Ejemplo (Node, sin dependencias)

```js
async function aNooby(ruta, cuerpo) {
  const { url, token } = config.nooby ?? {}
  if (!url || !token) return
  try {
    const r = await fetch(`${url}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': token },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) console.warn(`[nooby] ${ruta} respondió ${r.status}`)
  } catch (e) {
    console.warn(`[nooby] no pude hablar con Nooby: ${e.message}`)
  }
}

// Al terminar una impresión (junto al aviso de Telegram):
await aNooby('/api/aviso', { texto: `Che, la impresión terminó en la ${impresora.nombre}` })

// Cada vez que cambia algo y cada 30-60 s mientras se imprime:
await aNooby('/api/impresoras', { impresoras: todas.map((p) => ({ nombre: p.nombre, estado: p.estado, progreso: p.pct, restanteMin: p.faltanMin })) })
```

## Probarlo con curl (desde la Raspberry)

```bash
curl -i -X POST http://IP-DE-LA-PC:8777/api/aviso \
  -H 'Content-Type: application/json' -H 'X-Token: TU_TOKEN' \
  -d '{"texto":"Prueba desde la Raspberry"}'

curl -i -X POST http://IP-DE-LA-PC:8777/api/impresoras \
  -H 'Content-Type: application/json' -H 'X-Token: TU_TOKEN' \
  -d '{"impresoras":[{"nombre":"H2C","estado":"imprimiendo","progreso":45,"restanteMin":35}]}'
```

Esperado: `200` en las dos. `401` = token mal copiado. Sin respuesta = la PC no está en la misma red, la IP cambió o el acceso
por red está cerrado en el panel.

## Cómo saber que funciona

- Al mandar un aviso, el celu suena y la cara lo dice.
- En el panel de Nooby (sección 4) aparece "Impresoras: último informe hace N s" con lo que se mandó.
- Por voz: "che nooby" … "¿cómo van las impresoras?".
