package com.icc.maintrack;

import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.Collections;

/** New native build required. Activation requires reviewed RP, DAL and signing-certificate origin. */
@CapacitorPlugin(name = "MainTrackPasskey")
public final class MainTrackPasskeyPlugin extends Plugin {
    private static final String REVIEWED_RP_ID = ""; // Fail closed until actual Production is identified.
    private static final int MAX_JSON = 65536;
    private final Handler main = new Handler(Looper.getMainLooper());
    private PluginCall pending;
    private CancellationSignal cancellation;
    private Runnable deadline;

    @PluginMethod public void create(PluginCall call) { main.post(() -> begin(call, true)); }
    @PluginMethod public void get(PluginCall call) { main.post(() -> begin(call, false)); }

    private void begin(PluginCall call, boolean create) {
        if (REVIEWED_RP_ID.isEmpty()) { call.reject("PASSKEY_NOT_ACTIVATED"); return; }
        if (pending != null) { call.reject("PASSKEY_BUSY"); return; }
        if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) { call.reject("PASSKEY_ACTIVITY_UNAVAILABLE"); return; }
        try {
            String json = call.getString("requestJson");
            if (json == null || json.length() > MAX_JSON) throw new IllegalArgumentException();
            JSONObject options = new JSONObject(json);
            if (options.has("origin") || options.has("clientDataHash")) throw new IllegalArgumentException();
            String rp = create ? options.getJSONObject("rp").getString("id") : options.getString("rpId");
            if (!REVIEWED_RP_ID.equals(rp) || options.getString("challenge").isEmpty()) throw new IllegalArgumentException();
            pending = call;
            cancellation = new CancellationSignal();
            deadline = () -> { if (pending == call) cancelPending("PASSKEY_TIMEOUT"); };
            main.postDelayed(deadline, 60000);
            CredentialManager manager = CredentialManager.create(getActivity());
            if (create) {
                // No caller-controlled origin/hash; Android assembles native clientDataJSON.
                CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(json, null, false, null, false, false);
                manager.createCredentialAsync(getActivity(), request, cancellation, main::post,
                    new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                        public void onResult(CreateCredentialResponse response) {
                            if (!(response instanceof CreatePublicKeyCredentialResponse)) { finish(call, null, "PASSKEY_TYPE_REJECTED"); return; }
                            finish(call, ((CreatePublicKeyCredentialResponse) response).getRegistrationResponseJson(), null);
                        }
                        public void onError(CreateCredentialException error) { finish(call, null, "PASSKEY_CREATE_REJECTED"); }
                    });
            } else {
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(new GetPublicKeyCredentialOption(json, null, Collections.emptySet())).build();
                manager.getCredentialAsync(getActivity(), request, cancellation, main::post,
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        public void onResult(GetCredentialResponse response) {
                            if (!(response.getCredential() instanceof PublicKeyCredential)) { finish(call, null, "PASSKEY_TYPE_REJECTED"); return; }
                            finish(call, ((PublicKeyCredential) response.getCredential()).getAuthenticationResponseJson(), null);
                        }
                        public void onError(GetCredentialException error) { finish(call, null, "PASSKEY_GET_REJECTED"); }
                    });
            }
        } catch (Exception error) {
            if (pending == call) cancelPending("PASSKEY_REQUEST_REJECTED");
            else call.reject("PASSKEY_OPTIONS_REJECTED");
        }
    }

    private void finish(PluginCall call, String json, String error) {
        if (pending != call) return; // Late callbacks after deadline/destroy cannot resolve a newer call.
        main.removeCallbacks(deadline);
        pending = null; cancellation = null; deadline = null;
        if (error != null) { call.reject(error); return; }
        if (json == null || json.length() > MAX_JSON) { call.reject("PASSKEY_RESPONSE_REJECTED"); return; }
        JSObject result = new JSObject(); result.put("responseJson", json); call.resolve(result);
    }
    private void cancelPending(String reason) {
        PluginCall call = pending; CancellationSignal signal = cancellation;
        if (call == null) return;
        finish(call, null, reason);
        if (signal != null) signal.cancel();
    }
    @PluginMethod public void cancel(PluginCall call) { main.post(() -> { cancelPending("PASSKEY_CANCELLED"); call.resolve(); }); }
    @Override protected void handleOnDestroy() { main.post(() -> cancelPending("PASSKEY_ACTIVITY_DESTROYED")); }
}
