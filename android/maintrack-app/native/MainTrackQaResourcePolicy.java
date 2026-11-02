package com.icc.maintrack.qa;

import java.net.URI;
import java.util.Set;

// Isolated QA build only. No secret, IP identity, certificate bypass or wildcard.
public final class MainTrackQaResourcePolicy {
    private static final String GATEWAY = "maintrack-registered-isolated-qa.vercel.app";
    private static final String BACKEND = "szhstrafzkxzstjdcynl.supabase.co";
    private static final Set<String> GATEWAY_PATHS = Set.of("/api/login", "/api/core", "/api/inventory", "/.well-known/assetlinks.json");
    private static final Set<String> BACKEND_PATHS = Set.of("/functions/v1/maintrack-security-qa-final/api", "/functions/v1/maintrack-security-qa-final/readyz", "/functions/v1/maintrack-security-qa-inventory", "/functions/v1/maintrack-security-qa-inventory/readyz");
    public static boolean allowed(String value, boolean mainFrame) {
        try {
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443) || !uri.normalize().equals(uri) || value.indexOf('\\') >= 0) return false;
            if ("localhost".equals(uri.getHost())) return true;
            if (mainFrame || uri.getRawFragment() != null) return false;
            String host = uri.getHost(), path = uri.getRawPath();
            if (GATEWAY.equals(host)) return uri.getRawQuery() == null && GATEWAY_PATHS.contains(path);
            if (BACKEND.equals(host)) return uri.getRawQuery() == null && BACKEND_PATHS.contains(path);
            return "challenges.cloudflare.com".equals(host) || "fonts.googleapis.com".equals(host) || "fonts.gstatic.com".equals(host);
        } catch (Exception invalid) { return false; }
    }
    private MainTrackQaResourcePolicy() {}
}
