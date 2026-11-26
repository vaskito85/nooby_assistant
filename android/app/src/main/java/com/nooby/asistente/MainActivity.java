package com.nooby.asistente;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONException;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.StorageService;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Cáscara: muestra en pantalla completa la web de Nooby que sirve la PC en http://127.0.0.1:8777
 * (el celu llega ahí por USB con `adb reverse`). Si la PC todavía no está, muestra "esperando" y reintenta.
 * Le presta a la web lo que el WebView no trae:
 *   - la cámara (permiso),
 *   - la voz (TextToSpeech del sistema),
 *   - el oído: reconocimiento de voz en español SIN internet (Vosk). Solo pasa el texto a la web
 *     (evento "nooby-oyo"); toda la lógica ("che nooby", comandos) vive en la web.
 */
public class MainActivity extends Activity {
    private static final String ORIGEN = "http://127.0.0.1:8777";
    private static final int PEDIDO_PERMISOS = 7;
    private static final float FRECUENCIA = 16000.0f;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;

    // Permisos: un solo diálogo a la vez. La web puede pedir la cámara mientras el diálogo del sistema
    // está abierto: se juntan los pedidos y se responden cuando el usuario contesta.
    private final List<PermissionRequest> pendientes = new ArrayList<>();
    private boolean pidiendoPermisos = false;

    // Voz (hablar)
    private static final String MOTOR_GOOGLE = "com.google.android.tts";
    private TextToSpeech tts;
    private boolean ttsListo = false;
    private String textoPendiente = null;
    private String ultimoTexto = null;
    private String motorActual = null; // null = el motor por defecto del celu (en Samsung, "Samsung TTS")
    private boolean probadoGoogle = false;

    // Oído (escuchar). Dos modos:
    //  - "llamado": solo puede oír "che nube / nuevo…" (gramática cerrada): barato y casi sin falsos positivos.
    //    El modelo no conoce "nooby", así que se le ofrecen palabras comunes que suenan parecido.
    //  - "libre": vocabulario completo, para entender lo que se le pide después de despertarlo.
    // Gramática del modo "llamado". La web la reemplaza con las frases que el usuario entrenó con su voz.
    private String gramaticaLlamado =
            "[\"che nube\", \"che nubes\", \"che nuevo\", \"nube\", \"nubes\", \"[unk]\"]";
    private Model modelo;
    private Oyente servicioVoz;
    private Recognizer recActual;
    private String modoOido = "llamado";
    private boolean oidoPausado = false;
    private boolean iniciandoOido = false;
    private final Runnable reanudarOido = () -> pausarOido(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#070B16")));

        iniciarVoz(null);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070B16"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // las alarmas suenan sin tocar
        s.setUserAgentString(s.getUserAgentString() + " NoobyApp"); // la web se entera de que es el APK y arranca sola
        WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect para depurar

        web.addJavascriptInterface(new Puente(), "NoobyNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) mostrarEspera();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                // Solo se navega dentro de la web de Nooby.
                return !req.getUrl().toString().startsWith(ORIGEN);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> atenderPermiso(request));
            }
        });

        pedirPermisosIniciales();
        web.loadUrl(ORIGEN + "/");
    }

    // ---------- permisos ----------
    private boolean concedido(String permiso) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED;
    }

    /** Cámara y micrófono se piden juntos, en un solo diálogo, apenas abre la app. */
    private void pedirPermisosIniciales() {
        List<String> faltan = new ArrayList<>();
        if (!concedido(Manifest.permission.CAMERA)) faltan.add(Manifest.permission.CAMERA);
        if (!concedido(Manifest.permission.RECORD_AUDIO)) faltan.add(Manifest.permission.RECORD_AUDIO);
        if (faltan.isEmpty()) {
            iniciarOido();
            return;
        }
        pidiendoPermisos = true;
        requestPermissions(faltan.toArray(new String[0]), PEDIDO_PERMISOS);
    }

    private void atenderPermiso(PermissionRequest request) {
        // Solo la propia web de Nooby puede usar la cámara.
        if (!request.getOrigin().toString().startsWith(ORIGEN)) {
            request.deny();
            return;
        }
        if (concedido(Manifest.permission.CAMERA)) {
            request.grant(request.getResources());
            return;
        }
        pendientes.add(request);
        if (!pidiendoPermisos) {
            pidiendoPermisos = true;
            requestPermissions(new String[] {Manifest.permission.CAMERA}, PEDIDO_PERMISOS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permisos, int[] resultados) {
        if (code != PEDIDO_PERMISOS) return;
        // Resultado vacío = el pedido se canceló (llegó otro encima): no se responde nada todavía.
        if (resultados.length == 0) return;
        pidiendoPermisos = false;
        boolean camara = concedido(Manifest.permission.CAMERA);
        for (PermissionRequest r : pendientes) {
            if (camara) r.grant(r.getResources());
            else r.deny();
        }
        pendientes.clear();
        if (concedido(Manifest.permission.RECORD_AUDIO)) iniciarOido();
        else avisarJs("nooby-oido-error", "Sin permiso de micrófono");
    }

    // ---------- oído (Vosk, sin internet) ----------
    private void iniciarOido() {
        if (servicioVoz != null || iniciandoOido || !concedido(Manifest.permission.RECORD_AUDIO)) return;
        iniciandoOido = true;
        // La primera vez copia el modelo (unos 40 MB) desde el APK a la memoria del celu: tarda unos segundos.
        StorageService.unpack(this, "model-es", "model",
                (Model m) -> {
                    modelo = m;
                    iniciandoOido = false;
                    arrancarReconocedor();
                },
                (IOException e) -> {
                    iniciandoOido = false;
                    avisarJs("nooby-oido-error", "Modelo de voz: " + e.getMessage());
                });
    }

    private void arrancarReconocedor() {
        try {
            Recognizer rec = "llamado".equals(modoOido)
                    ? new Recognizer(modelo, FRECUENCIA, gramaticaLlamado)
                    : new Recognizer(modelo, FRECUENCIA);
            recActual = rec;
            // En modo "libre" además se guarda el audio de cada frase para que la web lo transcriba mejor (Whisper).
            servicioVoz = new Oyente(rec, oidoPausado, !"llamado".equals(modoOido)); // si justo estaba hablando, arranca en pausa
            servicioVoz.start();
            avisarJs("nooby-oido-listo", modoOido);
        } catch (IOException e) {
            avisarJs("nooby-oido-error", "No pude iniciar el reconocedor: " + e.getMessage());
        }
    }

    /** Mientras Nooby habla se deja de escuchar (si no, se oiría a sí mismo). */
    private void pausarOido(boolean pausa) {
        oidoPausado = pausa;
        if (servicioVoz != null) servicioVoz.pausar(pausa);
    }

    /** Cambia entre esperar "che nooby" ("llamado") y entender lo que se pide ("libre"). */
    private void cambiarModoOido(String modo, String gramatica) {
        if (!"llamado".equals(modo) && !"libre".equals(modo)) return;
        // La gramática solo se acepta si parece una lista JSON de frases (la arma la web con las variantes entrenadas).
        boolean cambioGramatica = gramatica != null && gramatica.startsWith("[") && gramatica.length() < 4000
                && !gramatica.equals(gramaticaLlamado);
        if (cambioGramatica) gramaticaLlamado = gramatica;
        boolean reiniciarPorGramatica = cambioGramatica && "llamado".equals(modo) && "llamado".equals(modoOido);
        if (modo.equals(modoOido) && !reiniciarPorGramatica) return;
        modoOido = modo;
        if (modelo == null || servicioVoz == null) return; // todavía no arrancó: arrancará ya en este modo
        servicioVoz.detener();
        servicioVoz = null;
        final Recognizer vieja = recActual;
        recActual = null;
        // Se cierra con un pequeño retraso: así ningún evento pendiente del servicio viejo toca un reconocedor ya cerrado.
        if (vieja != null) ui.postDelayed(vieja::close, 700);
        arrancarReconocedor();
    }

    /** Pasa a la web lo que se oyó: {"text": "..."} (frase terminada) o {"partial": "..."} (en curso). */
    private void enviarOido(String json) {
        try {
            JSONObject o = new JSONObject(json);
            String t = o.optString("text", o.optString("partial", ""));
            if (t.isEmpty()) return;
        } catch (JSONException e) {
            return;
        }
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('nooby-oyo',{detail:" + json + "}))", null);
    }

    private void avisarJs(String evento, String mensaje) {
        web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + evento + "',{detail:" + JSONObject.quote(mensaje) + "}))", null);
    }

    /** Pasa a la web el audio crudo (PCM 16 kHz, 16 bits, mono) de la frase que se acaba de terminar. */
    private void enviarAudio(final byte[] pcm) {
        final String b64 = Base64.encodeToString(pcm, Base64.NO_WRAP);
        final long ms = pcm.length / 32; // 16000 muestras/s * 2 bytes = 32 bytes por ms
        ui.post(() -> web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nooby-audio',{detail:{ms:" + ms + ",pcm:'" + b64 + "'}}))", null));
    }

    /**
     * Micrófono propio (reemplaza al SpeechService de Vosk, que no deja sacar el audio): lee el micrófono, se lo da a Vosk y,
     * si capturar es true, guarda el audio de cada frase y lo manda a la web junto con el texto.
     */
    private class Oyente extends Thread {
        private static final int MAX_FRASE_BYTES = 16000 * 2 * 25; // una frase de más de 25 s no se guarda
        private final Recognizer rec;
        private final boolean capturar;
        private volatile boolean pausa;
        private volatile boolean terminar = false;
        private final ByteArrayOutputStream frase = new ByteArrayOutputStream();
        private final ArrayDeque<byte[]> previo = new ArrayDeque<>(); // un poquito de audio de antes de que empiece a oír
        private boolean grabando = false;

        Oyente(Recognizer rec, boolean pausaInicial, boolean capturar) {
            this.rec = rec;
            this.pausa = pausaInicial;
            this.capturar = capturar;
            setName("nooby-oido");
        }

        void pausar(boolean p) {
            pausa = p;
        }

        void detener() {
            terminar = true;
        }

        private void olvidarFrase() {
            frase.reset();
            previo.clear();
            grabando = false;
        }

        @Override
        public void run() {
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO);
            int minimo = AudioRecord.getMinBufferSize((int) FRECUENCIA, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            AudioRecord grabador = null;
            try {
                grabador = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, (int) FRECUENCIA,
                        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimo, 32000));
                if (grabador.getState() != AudioRecord.STATE_INITIALIZED) {
                    avisarEnUi("nooby-oido-error", "No pude abrir el micrófono");
                    return;
                }
                grabador.startRecording();
                short[] buf = new short[2048]; // unos 128 ms
                while (!terminar) {
                    int n = grabador.read(buf, 0, buf.length);
                    if (n < 0) {
                        avisarEnUi("nooby-oido-error", "Error del micrófono (" + n + ")");
                        break;
                    }
                    if (n == 0) continue;
                    if (pausa) { // mientras Nooby habla no se escucha (se oiría a sí mismo)
                        if (grabando || previo.size() > 0) olvidarFrase();
                        continue;
                    }
                    boolean listo = rec.acceptWaveForm(buf, n);
                    String json = listo ? rec.getResult() : rec.getPartialResult();
                    String texto = textoDe(json);
                    if (capturar) {
                        byte[] bytes = new byte[n * 2];
                        for (int i = 0; i < n; i++) {
                            bytes[2 * i] = (byte) (buf[i] & 0xff);
                            bytes[2 * i + 1] = (byte) ((buf[i] >> 8) & 0xff);
                        }
                        if (!grabando && !texto.isEmpty()) {
                            grabando = true;
                            for (byte[] p : previo) frase.write(p, 0, p.length);
                            previo.clear();
                        }
                        if (grabando) {
                            if (frase.size() < MAX_FRASE_BYTES) frase.write(bytes, 0, bytes.length);
                        } else {
                            previo.addLast(bytes);
                            if (previo.size() > 3) previo.removeFirst();
                        }
                        if (listo && !texto.isEmpty() && grabando && frase.size() < MAX_FRASE_BYTES) enviarAudio(frase.toByteArray());
                    }
                    if (!texto.isEmpty()) enviarOidoEnUi(json);
                    if (listo) olvidarFrase();
                }
            } catch (Exception e) {
                avisarEnUi("nooby-oido-error", "Reconocedor: " + e.getMessage());
            } finally {
                if (grabador != null) {
                    try {
                        grabador.stop();
                    } catch (Exception ignorado) {
                        // ya estaba detenido
                    }
                    grabador.release();
                }
            }
        }

        private String textoDe(String json) {
            try {
                JSONObject o = new JSONObject(json);
                return o.optString("text", o.optString("partial", ""));
            } catch (JSONException e) {
                return "";
            }
        }

        private void enviarOidoEnUi(final String json) {
            ui.post(() -> enviarOido(json));
        }

        private void avisarEnUi(final String evento, final String mensaje) {
            ui.post(() -> avisarJs(evento, mensaje));
        }
    }

    // ---------- voz (hablar) ----------
    private void iniciarVoz(final String paquete) {
        motorActual = paquete;
        ttsListo = false;
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        TextToSpeech.OnInitListener alIniciar = status -> {
            if (status != TextToSpeech.SUCCESS) {
                runOnUiThread(this::fallaVoz);
                return;
            }
            int r = tts.setLanguage(new Locale("es", "AR"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                r = tts.setLanguage(new Locale("es", "ES"));
            }
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale("es"));
            }
            // Algunos motores (Samsung) dicen "idioma disponible" aunque no tengan la voz descargada y fallan
            // recién al sintetizar: por eso se escucha el error y se pasa a otro motor.
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { runOnUiThread(() -> pausarOido(true)); }
                @Override public void onDone(String id) { runOnUiThread(MainActivity.this::terminoDeHablar); }
                @Override public void onStop(String id, boolean interrumpido) { runOnUiThread(MainActivity.this::terminoDeHablar); }
                @Override public void onError(String id) {
                    runOnUiThread(() -> {
                        terminoDeHablar();
                        fallaVoz();
                    });
                }
                @Override public void onError(String id, int code) { onError(id); }
            });
            ttsListo = true;
            if (textoPendiente != null) {
                tts.speak(textoPendiente, TextToSpeech.QUEUE_FLUSH, null, "nooby");
                textoPendiente = null;
            }
        };
        tts = (paquete == null)
                ? new TextToSpeech(this, alIniciar)
                : new TextToSpeech(this, alIniciar, paquete);
    }

    private void terminoDeHablar() {
        ui.removeCallbacks(reanudarOido);
        pausarOido(false);
        avisarJs("nooby-hablo-fin", "");
    }

    private boolean instalado(String paquete) {
        try {
            getPackageManager().getPackageInfo(paquete, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** El motor actual no pudo hablar: se prueba Google TTS una vez; si tampoco, se avisa a la web. */
    private void fallaVoz() {
        if (motorActual == null && !probadoGoogle && instalado(MOTOR_GOOGLE)) {
            probadoGoogle = true;
            textoPendiente = ultimoTexto;
            iniciarVoz(MOTOR_GOOGLE);
            return;
        }
        web.evaluateJavascript("window.dispatchEvent(new Event('nooby-voz-error'))", null);
    }

    /** Lo que la web puede llamar como window.NoobyNativo.hablar("...") */
    private class Puente {
        @JavascriptInterface
        public void hablar(final String texto) {
            runOnUiThread(() -> {
                ultimoTexto = texto;
                pausarOido(true);
                // Por si el motor nunca avisa que terminó: a los 25 s se vuelve a escuchar igual.
                ui.removeCallbacks(reanudarOido);
                ui.postDelayed(reanudarOido, 25000);
                if (ttsListo && tts != null) {
                    tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "nooby");
                } else {
                    textoPendiente = texto;
                }
            });
        }

        /** Versión de este puente: 2 = modoOido(modo, gramatica) y entrenamiento; 3 = además manda el audio de cada frase (nooby-audio). */
        @JavascriptInterface
        public int apiVersion() {
            return 3;
        }

        @JavascriptInterface
        public void modoOido(final String modo, final String gramatica) {
            runOnUiThread(() -> cambiarModoOido(modo, gramatica));
        }

        @JavascriptInterface
        public void callar() {
            runOnUiThread(() -> {
                textoPendiente = null;
                if (tts != null) tts.stop();
                pausarOido(false);
            });
        }
    }

    /** Pantalla de espera: reintenta cada 3 s hasta que la PC responda. */
    private void mostrarEspera() {
        String html = "<html><body style='margin:0;background:#070B16;color:#93A1B8;font-family:sans-serif;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'>"
                + "<div><div style='font-size:64px;color:#5EEAD4'>• •</div>"
                + "<p style='font-size:20px;color:#E6EDF7'>Esperando a la PC…</p>"
                + "<p>Enchufá el cable USB y dejá corriendo el servidor de Nooby.</p></div>"
                + "<script>setTimeout(function(){location.href='" + ORIGEN + "/'},3000)</script></body></html>";
        web.loadDataWithBaseURL(ORIGEN + "/", html, "text/html", "utf-8", null);
    }

    private void pantallaCompleta() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) pantallaCompleta();
    }

    @Override
    protected void onResume() {
        super.onResume();
        pantallaCompleta();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(reanudarOido);
        if (servicioVoz != null) {
            servicioVoz.detener();
            try {
                servicioVoz.join(800); // que el hilo de audio termine antes de cerrar el reconocedor
            } catch (InterruptedException ignorado) {
                Thread.currentThread().interrupt();
            }
        }
        if (recActual != null) recActual.close();
        if (modelo != null) modelo.close();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        web.destroy();
        super.onDestroy();
    }
}
