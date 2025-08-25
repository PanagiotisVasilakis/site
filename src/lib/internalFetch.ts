export function internalFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init);
}
