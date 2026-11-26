# nooby_asistente — asistente personal con cara para un celu viejo

Web app de una pantalla (Vite + React + TS) que se muestra en un celu viejo (Galaxy Note 8, Android 9).
**Proyecto independiente**: no depende de `suite_impresion_3D`; los avisos le llegan por el servidor local (USB) o por ntfy.

## Arquitectura (modo principal: USB)
```
 PC: servidor/servidor.mjs (Node, sin deps) :8777   ⇄  cable USB (adb reverse)  ⇄  celu: APK Nooby (WebView → http://127.0.0.1:8777)
   - sirve dist/ (la web) y el panel (/#/panel)
   - /api/config (GET/PUT), /api/eventos (SSE: config + aviso), /api/aviso (POST JSON), /api/estado, /api/clima, /api/ciudad
   - mantiene `adb reverse tcp:8777 tcp:8777` y abre la app al enchufar el celu
   - opcional: puente desde un tema de ntfy (avisos desde la Raspberry)
```
- Config del servidor: `~/.nooby/config.json` (puerto, escuchar, token, adb, ntfy). Variables: NOOBY_PUERTO, NOOBY_ADB, NOOBY_CARPETA.
- Si la web NO la sirve ese servidor (ej. Vercel), la app cae al modo ntfy (`lib/ntfy.ts`, tema secreto por link).
- El APK (`android/`, Java, sin dependencias) solo es la cáscara: pantalla completa, cámara, no apagar pantalla, reintento si la PC no está.
  Se compila en GitHub Actions (`.github/workflows/apk.yml`; no hay Java/SDK local). UA incluye "NoobyApp" → la web arranca sola.

## Qué hace
- Cara animada (ojos que parpadean, humores: normal, feliz, dormido, alerta, hablando).
- Cámara frontal + MediaPipe FaceDetector (CPU, en el celu): detecta si estás sentado. Avisa a los N min seguidos
  (`lib/sentado.ts`, lógica pura con tests) y recuerda tomar agua.
- Avisos externos por **ntfy** (SSE): cualquier mensaje al tema suena como alarma y aparece en la cara
  ("Che, la impresión terminó"). Quien avisa (el agente del taller, un script…) solo hace un POST a ntfy.
- Botón de clima (Open-Meteo, sin clave; pasa por `/api/*` de Vercel y cae a directo). Voz con `speechSynthesis` (es-AR).
- **Los ajustes se hacen en el PANEL de la PC** (`/#/panel`, `src/Panel.tsx`), no en el celu. El panel publica la config
  (JSON) en el tema `<tema>-cfg` de ntfy; el celu se suscribe con `since=latest` y la guarda en localStorage.
  El celu recibe el tema una sola vez por link (`/?tema=…`, que se borra de la barra). Ntfy retiene 12 h; el celu guarda lo último.
- **Pantalla**: dos mitades fijas (apaisado: cara a la izquierda, info a la derecha; vertical: cara arriba). La cara es un cuadro de
  proporción fija con ojos/boca en posición absoluta: ningún gesto cambia tamaños, así nada se corre. Info = estado / mensaje / botones.
- Los ojos siguen la cara detectada (`lib/mirada.ts`, ~8 lecturas/s, suavizado por cuadro, escribe --gx/--gy) y el dedo; 4 toques en 5 s
  sobre la cara la enojan. Cada 60 s (y cuando cambia la conexión) aparece un globito pensador con una PC y ✓ verde / ✗ roja.
- **Oído (v0.3)**: el APK escucha con Vosk (offline, español; el modelo va en assets/model-es y lo baja el CI) y solo pasa TEXTO a la
  web (evento `nooby-oyo`, {text|partial}). Toda la lógica vive en la web (`lib/voz.ts`, con tests): "che nooby" (escrito como suena:
  nubi/nuvi/nuby…), "Sí, <nombre>", y comandos fijos (clima, hora, cuánto llevo sentado, ya me levanté, agua, gracias, ayuda).
  Mientras habla el TTS el micrófono se pausa (si no se oiría a sí mismo). `window.__noobyDebug.oido` guarda lo último que entendió.
  Etapa 2 pendiente: preguntas libres con una IA (la clave quedaría en el servidor de la PC, nunca en el celu).
- Comentarios (`lib/comentarios.ts`, con tests): al irte tras 30 s–5 min sentado dice "¿Ya te vas? Trabajaste poco." (máx. 1 cada 10 min);
  al volver tras 2 min o más dice "¡Hola de nuevo! ¿Cómo estuvo el recreo? ¿Qué hacemos ahora?". No pisan una alarma de impresión.
- Sonidos: solo la alarma de la impresión suena como alarma; clima/recordatorios/enojo no tienen "ding" (el enojo solo habla).
- Depurar el celu: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` + CDP; `window.__noobyDebug` trae ciclos, cuadros,
  conCara, msInferencia. La app del celu solo se reinstala si cambia su versionName (si no, se pierden los permisos).

## Comandos
```
npm run pc       # compila la web y levanta el servidor local (lo que se usa a diario)
npm run servidor # solo el servidor (usa dist/ ya compilado)
npm run dev      # http://localhost:5173 (la cámara exige https o localhost)
npm test         # vitest (lib/sentado)
npm run build    # tsc --noEmit && vite build
```

## Estructura
```
src/App.tsx        orquesta: inicio por toque, bucle de presencia, ntfy, botones, ajustes
src/Cara.tsx       la cara (CSS en estilos.css, data-humor)
servidor/          servidor.mjs (servidor local de la PC)
android/           cáscara APK (Gradle, Java)
src/lib/           canalLocal.ts (canal USB), sentado.ts (contador), presencia.ts (MediaPipe), ntfy.ts, clima.ts, audio.ts, config.ts (localStorage)
public/models/     blaze_face_short_range.tflite (modelo de MediaPipe, versionado)
public/mediapipe/  WASM copiado de node_modules por scripts/copiar-wasm.mjs (postinstall; no se versiona)
```

## Reglas
- NUNCA scroll horizontal (probar en 375 px). El celu no tiene pantalla de ajustes: todo va por el panel.
- El video no se graba ni se sube: solo se analiza cuadro a cuadro en el celu.
- El tema de ntfy es un secreto: no commitearlo; se guarda en localStorage (o `?tema=` en la URL la primera vez).
- Audio, cámara y wake lock exigen un toque del usuario: por eso la pantalla de inicio.
- Autor de commits: `vaskito85 <vasko85@gmail.com>` (config local).

## Estado
Ver `TASKS.md` y `bitacora.md`.
