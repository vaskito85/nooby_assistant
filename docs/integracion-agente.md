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
| **Atender pedidos de foto** (el usuario dice "mostrame la H2C") | `GET /api/pedidos` + `POST /api/foto` | La cara le pide la foto; cuando llega, la muestra grande en pantalla con la tarjeta de esa impresora. |
| **Mostrar una foto junto a un aviso** | `POST /api/foto` | La foto aparece en el panel de la derecha junto con el aviso, hasta el OK o los 5 minutos. |
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

Desde la red, el servidor **solo** acepta `POST /api/aviso`, `POST /api/impresoras`, `POST /api/foto` y `GET /api/pedidos`, y siempre con el token. Cualquier otra ruta
responde 403. No exponer el puerto a internet.

Si el token se filtra: "Generar token nuevo" en el panel y actualizarlo en el agente.

## `POST /api/aviso`

Encabezados: `Content-Type: application/json` y `X-Token: <token>`.

```json
{ "texto": "Che, la impresión terminó en la H2C", "estado": "terminada", "impresora": "H2C" }
```

- `texto`: obligatorio, hasta 300 caracteres. Frase corta, en español rioplatense, tal como se tiene que decir en voz alta.
- `estado`: opcional. Uno de `imprimiendo`, `terminada`, `error`, `pausa`. Le dice a la cara qué dibujo mostrar. Si no viene, Nooby lo
  deduce del texto ("terminó" → terminada, "falló"/"se cortó" → error, "pausa" → pausa, el resto → imprimiendo), pero **conviene mandarlo**.
- `impresora`: opcional, el nombre de la impresora (hasta 40 caracteres).
- Respuestas: `200 {"ok":true,"pantallas":1}` (`pantallas` = cuántas caras abiertas lo recibieron; 0 = el celu no está),
  `400` JSON inválido o falta `texto`, `401` token faltante o incorrecto, `415` falta `Content-Type: application/json`.

**Qué pasa en la pantalla del celu:** la cara de Nooby se reemplaza por una **impresora 3D dibujada** (imprimiendo: el cabezal barre y el objeto
crece; terminada: objeto completo con tilde verde; error: cruz roja; pausa: símbolo de pausa). Al costado quedan el texto del aviso y el estado
de cada impresora, tomado del último `POST /api/impresoras` (por eso conviene mandar ese informe **antes** del aviso). Todo queda hasta que el
usuario diga "OK" o toque el botón, o hasta que pasen **5 minutos**. La alarma suena unas veces y después se calla; la pantalla sigue.

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

## `POST /api/foto`

La foto de la cámara de la impresora (la misma que se manda por Telegram al terminar o fallar). Mismo `X-Token`.

- `Content-Type: image/jpeg` y el **JPEG tal cual en el cuerpo** (sin base64, sin JSON). Máximo **2 MB**.
- La impresora va en la dirección: `POST /api/foto?impresora=H2C` (o en el encabezado `X-Impresora`). Tiene que ser el mismo nombre que
  se manda en `/api/aviso` (`impresora`) y en `/api/impresoras` (`nombre`); no importan mayúsculas ni símbolos.
- Respuestas: `200 {"ok":true,"impresora":"h2c","bytes":9402}`, `400` no es un JPEG, `401` token, `413` más de 2 MB, `415` falta
  `Content-Type: image/jpeg`.
- **Cuándo mandarla:** junto con el aviso de que terminó o falló, **justo antes o justo después** (hasta 90 segundos de diferencia). Nooby empareja
  la foto con el aviso por cercanía en el tiempo y por impresora: una foto de otra impresora, o vieja, no se muestra.
- Se guarda **solo en memoria** (no en disco; se pierde al reiniciar el servidor) y solo la última de cada impresora (máx. 6). No mandarla
  periódicamente: es solo para acompañar un aviso.
- Si no hay foto, el aviso se ve igual que siempre. Con foto, el panel muestra solo la tarjeta de la impresora del aviso para que entre.

```bash
curl -i -X POST 'http://IP-DE-LA-PC:8777/api/foto?impresora=H2C'   -H 'Content-Type: image/jpeg' -H 'X-Token: TU_TOKEN' --data-binary @foto.jpg
```

Ejemplo en Node (el `buffer` es el JPEG que ya tiene el agente):

```js
await fetch(`${url}/api/foto?impresora=${encodeURIComponent(impresora.nombre)}`, {
  method: 'POST',
  headers: { 'content-type': 'image/jpeg', 'x-token': token },
  body: buffer,
  signal: AbortSignal.timeout(5000),
})
```

## `GET /api/pedidos` — atender los pedidos de foto

El usuario puede decir *"che nooby, mostrame la H2C"* (o "foto de la A1"). Nooby **nunca le habla al agente**: deja el pedido anotado y el agente lo
consulta. Así no hay que abrir nada en la Raspberry.

- `GET {url}/api/pedidos?espera=20` con el `X-Token`. Con `espera` (hasta 25 segundos) la respuesta **espera a que haya un pedido** y
  contesta en el momento en que aparece; si no hay ninguno, contesta `{"pedidos":[]}` a los 20 s y se vuelve a preguntar. Es la forma de enterarse
  casi al instante sin consultar cada segundo.
- Respuesta: `{"pedidos":[{"id":"1ae2d5f9ed9c","impresora":"Bambu H2C","clave":"bambu-h2c","restanteMs":44000}]}`. `impresora` es el nombre
  exacto tal como el agente lo informó en `/api/impresoras` (`nombre`).
- **Qué hacer con cada pedido:** sacar **una** foto de esa impresora y mandarla con `POST /api/foto?impresora=<ese nombre>`. Al llegar la foto,
  el pedido se da por cumplido solo (no hay que avisar nada más). Si la impresora no tiene cámara disponible, **ignorar el pedido**: a los 20 s la
  pantalla explica que no llegó la foto. Un pedido vive 45 s; si el usuario cierra la vista antes, Nooby lo cancela.
- Es **solo fotos** por ahora (nada de video). Una foto por pedido: no mandar imágenes seguidas.
- Todo queda dentro de la red local: agente → PC por la red, PC → celu por el cable USB.

```js
// Bucle de pedidos (corre siempre, en segundo plano; nunca debe tumbar al agente)
async function atenderPedidosDeNooby() {
  for (;;) {
    try {
      const r = await fetch(`${url}/api/pedidos?espera=20`, { headers: { 'x-token': token }, signal: AbortSignal.timeout(30000) })
      const { pedidos = [] } = r.ok ? await r.json() : {}
      for (const p of pedidos) {
        const jpeg = await sacarFoto(p.impresora) // Buffer con el JPEG, o null si esa impresora no tiene cámara
        if (!jpeg) continue
        await fetch(`${url}/api/foto?impresora=${encodeURIComponent(p.impresora)}`, {
          method: 'POST',
          headers: { 'content-type': 'image/jpeg', 'x-token': token },
          body: jpeg,
          signal: AbortSignal.timeout(8000),
        })
      }
    } catch (e) {
      console.warn(`[nooby] pedidos: ${e.message}`)
      await new Promise((ok) => setTimeout(ok, 10_000)) // si Nooby no está, reintentar sin apurar
    }
  }
}
```

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
await aNooby('/api/aviso', { texto: `Che, la impresión terminó en la ${impresora.nombre}`, estado: 'terminada', impresora: impresora.nombre })

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

- Al mandar un aviso, el celu suena y la cara lo dice. Si mandaste también una foto, aparece en el panel de la derecha.
- En el panel de Nooby (sección 4) aparece "Impresoras: último informe hace N s" con lo que se mandó.
- Por voz: "che nooby" … "¿cómo van las impresoras?".
