package com.icc.maintrack;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Owner-device session storage. Tokens never enter SharedPreferences as plaintext.
 * Only built into a newly signed native APK: OTA cannot add a native plugin.
 */
@CapacitorPlugin(name = "MainTrackSecureSession")
public final class MainTrackSecureSessionPlugin extends Plugin {
    private static final String PREFS = "maintrack_protected_session_v1";
    private static final String ENTRY = "encrypted";
    private static final String KEY_ALIAS = "maintrack_device_session_aes_v1";
    private static final int MAX_BYTES = 4096;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) {
            return (SecretKey) store.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(), new SecureRandom());
        return generator.generateKey();
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null || value.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
                call.reject("SESSION_INPUT_INVALID"); return;
            }
            JSONObject session = new JSONObject(value);
            String token = session.optString("token", "");
            String code = session.optString("code", "");
            if (!token.matches("[a-f0-9]{64}") || code.isEmpty() || code.length() > 64) {
                call.reject("SESSION_INPUT_INVALID"); return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] nonce = cipher.getIV();
            byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[nonce.length + sealed.length];
            System.arraycopy(nonce, 0, payload, 0, nonce.length);
            System.arraycopy(sealed, 0, payload, nonce.length, sealed.length);
            if (!prefs().edit().putString(ENTRY, Base64.encodeToString(payload, Base64.NO_WRAP)).commit()) {
                call.reject("SESSION_SAVE_FAILED"); return;
            }
            call.resolve();
        } catch (Exception ignored) {
            call.reject("SESSION_SAVE_FAILED");
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            String raw = prefs().getString(ENTRY, null);
            JSObject result = new JSObject();
            if (raw == null) { result.put("exists", false); call.resolve(result); return; }
            byte[] packed = Base64.decode(raw, Base64.DEFAULT);
            if (packed.length < 29 || packed.length > MAX_BYTES + 48) {
                call.reject("SESSION_DECRYPT_FAILED"); return;
            }
            byte[] nonce = new byte[12];
            byte[] ciphertext = new byte[packed.length - nonce.length];
            System.arraycopy(packed, 0, nonce, 0, nonce.length);
            System.arraycopy(packed, nonce.length, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, nonce));
            byte[] plain = cipher.doFinal(ciphertext);
            result.put("exists", true);
            result.put("value", new String(plain, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception ignored) {
            call.reject("SESSION_DECRYPT_FAILED");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (prefs().edit().remove(ENTRY).commit()) call.resolve();
        else call.reject("SESSION_CLEAR_FAILED");
    }
}
