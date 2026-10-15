// Local shell readiness only: never wait for login, connectivity, or an API.
export function createBootHealth({isShellReady, isDataCompatible, notifyReady}) {
  let failed = false, notified = false;
  return Object.freeze({
    fail() {failed = true;},
    async check() {
      if (failed || notified) return false;
      try {
        if (isShellReady() !== true || isDataCompatible() !== true) return false;
        notified = true;
        await notifyReady();
        return true;
      } catch {failed = true; return false;}
    }
  });
}
