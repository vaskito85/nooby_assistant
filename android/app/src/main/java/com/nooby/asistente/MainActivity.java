package com.nooby.asistente;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Cáscara mínima: muestra en pantalla completa la web de Nooby que sirve la PC
 * en http://127.0.0.1:8777 (el celu llega ahí por USB con `adb reverse`).
 * Si la PC todavía no está, muestra "esperando" y reintenta solo.
 */
public class MainActivity extends Activity {
    private static final String ORIGEN = "http://127.0.0.1:8777";
    private static final int PEDIDO_CAMARA = 7;

    private WebView web;
    private PermissionRequest pendiente;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#070B16")));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070B16"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // la voz y las alarmas suenan sin tocar
        s.setUserAgentString(s.getUserAgentString() + " NoobyApp"); // la web se entera de que es el APK y arranca sola
        WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect para depurar

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) mostrarEspera();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // Solo la propia web de Nooby puede usar la cámara.
                    if (!request.getOrigin().toString().startsWith(ORIGEN)) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.getResources());
                    } else {
                        pendiente = request;
                        requestPermissions(new String[] {Manifest.permission.CAMERA}, PEDIDO_CAMARA);
                    }
                });
            }
        });

        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.CAMERA}, PEDIDO_CAMARA);
        }

        web.loadUrl(ORIGEN + "/");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permisos, int[] resultados) {
        if (code == PEDIDO_CAMARA && pendiente != null) {
            if (resultados.length > 0 && resultados[0] == PackageManager.PERMISSION_GRANTED) {
                pendiente.grant(pendiente.getResources());
            } else {
                pendiente.deny();
            }
            pendiente = null;
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
        web.destroy();
        super.onDestroy();
    }
}
