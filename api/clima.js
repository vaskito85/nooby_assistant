// Proxy mínimo al pronóstico de Open-Meteo. Solo reenvía lat/lon (números); no es un proxy abierto.
export async function GET(request) {
  const p = new URL(request.url).searchParams
  const lat = Number(p.get('lat'))
  const lon = Number(p.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: 'lat/lon inválidos' }, { status: 400 })
  }
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1'
  const r = await fetch(url)
  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=600' },
  })
}
