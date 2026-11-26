package com.nooby.asistente;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Cáscara mínima: muestra en pantalla completa la web de Nooby que sirve la PC
 * en http://127.0.0.1:8777 (el celu llega ahí por USB con `adb reverse`).
 * Si la PC todavía no está, muestra "esperando" y reintenta solo.
 * Además le presta a la web dos cosas que el WebView no trae: la cámara (permiso) y la voz (TextToSpeech).
 */
public class MainActivity extends Activity {
    private static final String ORIGEN = "http://127.0.0.1:8777";
    private static final int PEDIDO_CAMARA = 7;

    private WebView web;

    // Cámara: la web puede pedirla mientras el diálogo del sistema todavía está abierto.
    // Se juntan los pedidos y se responden todos cuando el usuario contesta (un solo diálogo).
    private final List<PermissionRequest> pendientes = new ArrayList<>();
    private boolean pidiendoCamara = false;

    // Voz
    private TextToSpeech tts;
    private boolean ttsListo = false;
    private String textoPendiente = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#070B16")));

        iniciarVoz();

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

        web.loadUrl(ORIGEN + "/");
    }

    // ---------- cámara ----------
    private boolean camaraConcedida() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void atenderPermiso(PermissionRequest request) {
        // Solo la propia web de Nooby puede usar la cámara.
        if (!request.getOrigin().toString().startsWith(ORIGEN)) {
            request.deny();
            return;
        }
        if (camaraConcedida()) {
            request.grant(request.getResources());
            return;
        }
        pendientes.add(request);
        if (!pidiendoCamara) {
            pidiendoCamara = true;
            requestPermissions(new String[] {Manifest.permission.CAMERA}, PEDIDO_CAMARA);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permisos, int[] resultados) {
        if (code != PEDIDO_CAMARA) return;
        // Resultado vacío = el pedido se canceló (llegó otro encima): no se responde nada todavía.
        if (resultados.length == 0) return;
        pidiendoCamara = false;
        boolean ok = resultados[0] == PackageManager.PERMISSION_GRANTED;
        for (PermissionRequest r : pendientes) {
            if (ok) r.grant(r.getResources());
            else r.deny();
        }
        pendientes.clear();
    }

    // ---------- voz ----------
    private void iniciarVoz() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(new Locale("es", "AR"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                r = tts.setLanguage(new Locale("es", "ES"));
            }
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale("es"));
            }
            ttsListo = true;
            if (textoPendiente != null) {
                tts.speak(textoPendiente, TextToSpeech.QUEUE_FLUSH, null, "nooby");
                textoPendiente = null;
            }
        });
    }

    /** Lo que la web puede llamar como window.NoobyNativo.hablar("...") */
    private class Puente {
        @JavascriptInterface
        public void hablar(final String texto) {
            runOnUiThread(() -> {
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
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        web.destroy();
        super.onDestroy();
    }
}
