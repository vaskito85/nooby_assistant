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
  Dos modos (`NoobyNativo.modoOido`): **llamado** = gramática cerrada ["che nube","che nuevo","nube",…] (el modelo no conoce "nooby", así que
  se le ofrecen palabras comunes parecidas; barato y casi sin falsos positivos) y **libre** = vocabulario completo, que se usa mientras está
  "atento" para entender los pedidos. La web cambia de modo según su estado. Mientras habla el TTS el micrófono se pausa (si no se oiría a sí mismo). `window.__noobyDebug.oido` guarda lo último que entendió.
  Etapa 2 hecha (v0.6): ver **Charla con IA**.
- Comentarios (`lib/comentarios.ts`, con tests): al irte tras 30 s–5 min sentado dice "¿Ya te vas? Trabajaste poco." (máx. 1 cada 10 min);
  al volver tras 2 min o más dice "¡Hola de nuevo! ¿Cómo estuvo el recreo? ¿Qué hacemos ahora?". No pisan una alarma de impresión.
- Sonidos: solo la alarma de la impresión suena como alarma; clima/recordatorios/enojo no tienen "ding" (el enojo solo habla).
- **Vistas por voz** (`Vista` en App.tsx): pedir las impresoras o el clima cambia la cara por un dibujo (`ImpresoraAnimada` / `ClimaAnimado`, mismo cuadro que la cara) y deja la info al
  costado (`PanelImpresora` / `PanelClima`) hasta el OK (botón o voz) o 5 min. Clima: `escenaClima(codigo WMO, esDia)` → sol, luna, solNubes, lunaNubes, nubes, niebla, lluvia, tormenta,
  nieve (SVG con SMIL, animaciones lentas). Impresoras: solo si hay un informe fresco (si no, lo dice sin dibujo). Prioridad de pantalla: alarma de impresora > vista > cara.
- **Pedidos por voz**: `CATALOGO` en `lib/voz.ts` es la lista de todo lo que entiende (18 grupos: hora, fecha, clima, impresoras, cuánto llevás sentado, charla, chistes,
  repetir, despedirse…). `interpretar()` es la primera regla que coincide (el orden importa); `tests/frases.test.ts` comprueba que CADA ejemplo del catálogo se entienda,
  así la lista del panel ("Qué le puedo decir a Nooby") nunca miente. Respuestas en `lib/respuestas.ts` (puras; el azar se inyecta). Para agregar un pedido: regla en
  `interpretar`, entrada en `CATALOGO`, caso en `ejecutar` de App.tsx.
- **Entrenar la frase de despertar**: el modelo no conoce "nooby", así que se le enseña con tu voz. Panel > "3. Despertar a Nooby" > "Entrenar con mi voz":
  el servidor emite el evento SSE `entrenar`, el celu pide repetir la frase 5 veces (modo libre), anota lo que entiende el reconocedor
  (p. ej. "china vi") y lo guarda como `llamadas` en la config. Esas frases pasan a ser la gramática del modo llamado
  (`NoobyNativo.modoOido(modo, gramaticaJson)`, APK >= 0.4.0, `apiVersion() >= 2`). Se suman entre entrenamientos; el panel las quita.
- **Presencia = cara O usando la PC** (`lib/actividad.ts`): el servidor lee el tiempo desde la última tecla/mouse de Windows
  (GetLastInputInfo vía un PowerShell residente, solo ese número) y lo manda por SSE (`actividad`). Si es menor a 90 s cuenta como sentado
  aunque la cámara no vea la cara (celu al costado). `__noobyDebug.pcActiva` / `idlePcMs` para diagnosticar.
- **Acceso desde otras máquinas** (Raspberry/agente de impresoras): panel > sección 4 abre `escuchar: 0.0.0.0` + token. Desde la red SOLO se acepta
  `POST /api/aviso` y `POST /api/impresoras` con `X-Token`; el resto da 403. Lo que llega por localhost (panel, celu por USB) no pide token pero valida
  el Host (anti DNS-rebinding). Contrato completo para el otro agente: `docs/integracion-agente.md`. Voz: "¿cómo van las impresoras?" lee el último informe.
- **Foto a pedido**: "mostrame la H2C" → `pedirVerImpresora` elige la impresora por el nombre hablado (`elegirImpresora`: traduce "hache dos ce"/"a uno"/"neptuno cuatro"),
  `POST /api/pedido` deja el pedido en el servidor (45 s, solo localhost) y el agente lo atiende con `GET /api/pedidos?espera=20` (consulta larga, con token) → `POST /api/foto`.
  La vista `foto` muestra `VisorFoto` (grande, en el lugar de la cara) + una tarjeta; "pidiéndole la foto…" y, a los 20 s sin foto, explica. Cerrar la vista cancela el pedido. Solo fotos (sin video).
- **Paciencia** (`ESPERA_FIN_MS` en App.tsx): los finales de Vosk se juntan y se procesan tras 1 s de silencio; un parcial nuevo reinicia la espera. No se lo puede interrumpir mientras habla.
- **Charla con IA** (v0.6): lo que `interpretar` no entiende (2+ palabras) va a `POST /api/charla` (App.tsx `charlarLibre`, historial de 10 mensajes que se reinicia a los 5 min). El servidor (`servidor/ia.mjs`, con tests en `tests/ia.test.ts`) llama a Groq (API tipo OpenAI, modelo por defecto llama-3.3-70b-versatile) con herramientas: poner_temporizador, crear_recordatorio, ver_agenda, cancelar_agenda, ver_clima, ver_impresoras; se ejecutan en el servidor (`herramientaIA`). La clave está en `~/.nooby/config.json` (`servidor.ia`) o en GROQ_API_KEY; se carga desde el panel (sección 5, `/api/ia`, que nunca la devuelve) y NUNCA llega al celu. Tope local 20 llamadas/min. Sin clave o sin internet: el "¿Cómo? No te entendí." de siempre. NOOBY_IA_URL cambia el endpoint (para pruebas con un Groq falso).
- **Cara** (v0.10): `src/Cara.tsx` es un SVG de 500×400 (placa, ojos con blanco/iris/pupila y párpados, cejas, mejillas, boca con labios, dientes y lengua). Los datos viven en `lib/rostro.ts` (puro, con `tests/rostro.test.ts`): `POSES` (una por humor: párpados, cejas, boca…), `trazoBoca` (curva de la boca a partir de ancho/apertura/sonrisa/redondez) y `planHabla` (una forma de boca por letra, vocales abren, b/m/p cierran). `lib/rostroVivo.ts` anima cuadro a cuadro fuera de React: suaviza hacia la pose, parpadea solo, respira, y sigue el plan de habla. `audio.ts hablar()` emite `nooby-habla` con el texto y la cara mueve la boca (duración estimada ~14 letras/s, 280 ms de latencia; si no hay plan, mueve la boca suave). Humores: normal, feliz, atento, hablando, pensando (mientras espera a la IA), confuso (no entendió), triste (falló la IA), risa (chistes), bostezo (cansado), sorprendido, enojado, alerta, dormido; los gestos de risa/bostezo/duda/pena salen al terminar de hablar (`hacerGesto`). Los ojos siguen a la persona con `--gx/--gy` (`mirada.ts`, que ahora también se distrae solo cuando no hay a quién mirar). Colores por humor en estilos.css. Galería para probar todas las caras y la boca con un texto: `/#/caras`.
- **Bitácora y memoria** (v0.9): `servidor/bitacora.mjs` (con `tests/bitacora.test.ts`). Todo lo que se habla después de despertarlo se guarda en `~/.nooby/bitacora/AAAA-MM-DD.md` (una línea por entrada: `- **HH:MM** **Ger:** texto`, `**Nooby:**` o `📝` para notas) y los datos que pedís recordar en `~/.nooby/memoria.json` (se inyectan en el prompt de la IA). La cara guarda desde `anotar()` de App.tsx (`POST /api/bitacora {rol,texto}`); el panel (sección Bitácora) lee `GET /api/bitacora[?dia=|?q=|&formato=md]`, borra con `DELETE ?dia=` y maneja `/api/memoria`. Pedidos por voz (reglas, antes que "tiempoSentado"): `anotarBitacora` (`extraerNota`), `pausarBitacora` / `retomarBitacora` (modo privado: no se guarda nada hasta "seguí guardando" o hasta que se duerme; se ve "🔒 privado"), `borrarUltimo`. La IA además tiene las herramientas leer_bitacora, buscar_bitacora, anotar_en_bitacora, recordar_dato, olvidar_dato ("qué hablamos ayer", "resumime la semana"). Solo `esDia` (AAAA-MM-DD) toca el disco. **Modo conversación**: tras una respuesta de la IA queda atento 30 s (`ATENTO_CHARLA_MS`) sin pedir "che nooby". El release copia `servidor/*.mjs`.
- **Whisper** (v0.8, APK 0.5.0): el APK ya no usa SpeechService sino su propio hilo de micrófono (`Oyente`): se lo da a Vosk y, en modo libre, guarda el audio PCM de cada frase y lo manda a la web (evento `nooby-audio`, justo antes de `nooby-oyo`; `apiVersion() >= 3`). La web junta los trozos mientras está atenta y, al terminar la frase (paciencia), los manda a `POST /api/transcribir`: el servidor arma un WAV y llama a Whisper de Groq (`whisper-large-v3-turbo`, `ia.mjs`: `transcribir`, filtra alucinaciones). Si responde se usa su texto; si falla (sin clave, sin internet, cupo, APK viejo) se usa el de Vosk y no se reintenta por 60 s. Se apaga desde el panel (`ia.whisper`). NOOBY_STT_URL cambia el endpoint para pruebas. Tope local 15/min. El audio SALE a Groq solo en esta etapa.
- **Agenda** (v0.5): temporizadores y recordatorios viven en el servidor (`~/.nooby/agenda.json`, `/api/agenda`, `/api/agenda/cancelar`, evento SSE `agenda`; si no hay cara conectada queda pendiente 24 h). Parseo en `lib/numeros.ts`, `lib/tiempo.ts`, `lib/fechas.ts` (cuánto falta para Navidad, etc.). Diálogo de seguimiento (`dialogoRef`): si falta el texto o la hora, pregunta; un pedido nuevo claro cancela la pregunta. Alarma: `RelojAnimado` + `PanelAviso`. No hay botones en pantalla: clima y "ya me levanté" son solo por voz.
- **Mensajes**: los comunes se van solos 5 s después de decirse (voz + 5 s); la alarma de la impresora queda hasta el OK o 5 min. Lo que se oye se muestra en vivo (`zona-oyendo`, ✓/✗);
  si no entiende dice "¿Cómo? No te entendí."
- **Aviso de la impresora** (alarma): la cara se reemplaza por `ImpresoraAnimada` (mismo cuadro que la cara: nada se corre; SVG con SMIL: imprimiendo / terminada ✓ /
  error ✗ / pausa) y el costado muestra `PanelImpresora` (texto + estado de cada impresora del último informe, errores primero, máx. 3). Se cierra con "OK" (botón o voz:
  mientras suena la alarma el micrófono pasa a modo libre) o a los 5 min (`AVISO_IMPRESORA_MS`). El estado viene en `POST /api/aviso {estado}` o se deduce del texto
  (`inferirEstado`). Un aviso nuevo reemplaza al anterior y reinicia la cuenta.
- **Fotos de la impresora**: `POST /api/foto?impresora=H2C` (JPEG crudo ≤ 2 MB, con X-Token desde la red). Se guardan SOLO en memoria (máx. 6, una por impresora); el servidor emite
  el evento SSE `foto` y el celu la pide con `GET /api/foto` (solo localhost). `lib/fotos.ts` la empareja con el aviso por cercanía (±90 s, reloj del celu) e impresora.
  Con foto, `PanelImpresora` muestra solo la tarjeta de esa impresora para que todo entre.
- La cámara se auto-frena: si una lectura tarda mucho (celu cargado), espera el doble antes de la siguiente (`msInferencia` en __noobyDebug).
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
