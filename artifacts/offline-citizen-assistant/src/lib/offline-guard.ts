/** Reject external requests so a dependency cannot silently add a cloud fallback. */
export function installOfflineGuard() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (url.origin !== window.location.origin) return Promise.reject(new Error(`External network requests are disabled: ${url.origin}`));
    return originalFetch(input, init);
  };
}
