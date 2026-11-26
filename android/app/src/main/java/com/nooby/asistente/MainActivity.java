package com.nooby.asistente;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.io.IOException;
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

    // Oído (escuchar)
    private Model modelo;
    private SpeechService servicioVoz;
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
            Recognizer rec = new Recognizer(modelo, FRECUENCIA);
            servicioVoz = new SpeechService(rec, FRECUENCIA);
            servicioVoz.startListening(new RecognitionListener() {
                @Override public void onPartialResult(String h) { enviarOido(h); }
                @Override public void onResult(String h) { enviarOido(h); }
                @Override public void onFinalResult(String h) { /* solo al detener: ya se envió en onResult */ }
                @Override public void onError(Exception e) { avisarJs("nooby-oido-error", "Reconocedor: " + e.getMessage()); }
                @Override public void onTimeout() { }
            });
            avisarJs("nooby-oido-listo", "ok");
        } catch (IOException e) {
            avisarJs("nooby-oido-error", "No pude iniciar el reconocedor: " + e.getMessage());
        }
    }

    /** Mientras Nooby habla se deja de escuchar (si no, se oiría a sí mismo). */
    private void pausarOido(boolean pausa) {
        if (servicioVoz != null) servicioVoz.setPause(pausa);
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
            servicioVoz.stop();
            servicioVoz.shutdown();
        }
        if (modelo != null) modelo.close();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        web.destroy();
        super.onDestroy();
    }
}
