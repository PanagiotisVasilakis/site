// Minimal analytics collection script with fallback & SW queue cooperation
(function(){
  const endpoint = '/api/analytics';
  const payload = { path: location.pathname, ts: Date.now(), locale: location.pathname.split('/')[1] };
  const body = JSON.stringify(payload);
  let sent = false;
  try {
    if (navigator.sendBeacon) {
      sent = navigator.sendBeacon(endpoint, body);
    }
  } catch {}
  if (!sent) {
    fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' } }).catch(() => {
      // Ask SW to queue if available
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'QUEUE_ANALYTICS', body });
      }
    });
  }
})();
