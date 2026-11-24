/** The Routing module's cookies, all `__Host-` ones: the whole origin's, HttpOnly, over TLS alone. No I/O. */

export const setCookie = (name: string, value: string, lifetimeMs: number): string =>
  `${name}=${value}; Path=/; Max-Age=${String(lifetimeMs / 1000)}; Secure; HttpOnly; SameSite=Lax`;

export const clearCookie = (name: string): string => `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;

/** The browser's cookies by name; the first of a name, as browsers send the most specific first. */
export function cookiesOf(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of (header ?? "").split(";")) {
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (separator > 0 && !cookies.has(name)) cookies.set(name, pair.slice(separator + 1).trim());
  }
  return cookies;
}
