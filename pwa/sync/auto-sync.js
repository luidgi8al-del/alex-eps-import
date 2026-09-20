/** Coalesced writes, a single running request, and bounded failure retries. */
export function createAutoSync({ run, online, now = Date.now,
  schedule = setTimeout, cancel = clearTimeout, debounceMs = 1500,
  refreshMs = 60000, retryMaxMs = 300000 }) {
  let running = null, timer = null, dirty = false, failures = 0, nextAttempt = 0;
  function arm(delay) {
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; request(); }, delay);
  }
  function request({ force = false } = {}) {
    if (!online()) return Promise.resolve(false);
    if (running) return running;
    if (!force && now() < nextAttempt) {
      if (dirty) arm(nextAttempt - now());
      return Promise.resolve(false);
    }
    if (timer !== null) { cancel(timer); timer = null; }
    const sendingWrite = dirty;
    dirty = false;
    function failed(result) {
      dirty ||= sendingWrite || Boolean(result?.pending);
      failures++;
      nextAttempt = now() + Math.min(retryMaxMs, 15000 * 2 ** Math.min(failures - 1, 5));
      return false;
    }
    running = Promise.resolve().then(run).then(result => {
      if (!result || ['error', 'offline', 'pending'].includes(result.state)) return failed(result);
      failures = 0;
      nextAttempt = now() + refreshMs;
      return true;
    }, () => failed()).finally(() => {
      running = null;
      // An edit made during a run cannot disappear in that run's acknowledgement.
      if (dirty) {
        if (!failures) nextAttempt = now() + debounceMs;
        arm(Math.max(debounceMs, nextAttempt - now()));
      }
    });
    return running;
  }
  function changed() {
    dirty = true;
    if (!failures) nextAttempt = now() + debounceMs;
    arm(Math.max(debounceMs, nextAttempt - now()));
  }
  return { request, changed };
}
