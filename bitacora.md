# Bitácora

## 2026-11-26 — arranque
- Proyecto independiente de la suite 3D; la impresión entra como un aviso externo (ntfy), no por Supabase.
- ntfy elegido por ser abierto, sin cuenta y por poder usarse desde el navegador por SSE. Falta decidir público vs propio.
- Vite + React + TS sin Tailwind: la cara es CSS propio y la UI es mínima.
- MediaPipe FaceDetector con modelo y WASM servidos desde el mismo origen (sin CDN), delegate CPU para celus viejos.
- Verificado en 375 px (sin scroll horizontal); la cámara no se pudo probar en el panel del navegador de Claude (bloqueada).
