// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
export async function internalFetch(input: string, init?: RequestInit) {
  return fetch(input, init);
}

export default internalFetch;