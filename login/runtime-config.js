(function(){
  // Default runtime config: prefer localhost in dev, otherwise current origin.
  try {
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const defaultBase = (host === 'localhost' || host === '127.0.0.1') ? 'http://localhost:3000' : (typeof window !== 'undefined' ? window.location.origin : '');
    // Allow an existing value to persist (e.g., set by the hosting platform during deploy)
    if (!window.__API_BASE__) {
      window.__API_BASE__ = defaultBase;
    }
  } catch (e) {
    // silent fallback
    window.__API_BASE__ = window.__API_BASE__ || '';
  }
})();
