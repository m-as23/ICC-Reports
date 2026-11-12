package com.icc.maintrack.qa;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import java.io.ByteArrayInputStream;

// Retains system TLS validation and pins all remote resources to the approved QA
// backend/gateway/provider. Top-level navigation stays on the packaged origin.
public final class MainTrackQaWebViewClient extends BridgeWebViewClient {
    public MainTrackQaWebViewClient(Bridge bridge) { super(bridge); }
    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!MainTrackQaResourcePolicy.allowed(request.getUrl().toString(), request.isForMainFrame()))
            return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        return super.shouldInterceptRequest(view, request);
    }
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !MainTrackQaResourcePolicy.allowed(request.getUrl().toString(), request.isForMainFrame());
    }
    @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); }
}
