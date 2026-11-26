// Proxy mínimo al buscador de ciudades de Open-Meteo: así el celu solo necesita llegar a este mismo dominio.
// Solo reenvía el parámetro `name`; no es un proxy abierto.
export async function GET(request) {
  const name = (new URL(request.url).searchParams.get('name') ?? '').slice(0, 80)
  if (name.trim().length < 3) return Response.json({ results: [] })
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(name)}&count=6&language=es&format=json`
  const r = await fetch(url)
  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=86400' },
  })
}
