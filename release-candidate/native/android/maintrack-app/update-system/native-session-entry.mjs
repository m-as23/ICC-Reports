// Native-only session bridge. The old APK intentionally does not persist a token.
import { Capacitor, registerPlugin } from '@capacitor/core';
const supported = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MainTrackSecureSession');
const plugin = registerPlugin('MainTrackSecureSession');
globalThis.MainTrackSecureSession = Object.freeze({
  available: () => supported,
  async read() {
    if (!supported) return null;
    const result = await plugin.read();
    return result.exists && typeof result.value === 'string' ? JSON.parse(result.value) : null;
  },
  async save(session) {
    if (!supported) return false;
    await plugin.save({value: JSON.stringify(session)});
    return true;
  },
  async clear() {
    if (!supported) return false;
    await plugin.clear();
    return true;
  }
});
