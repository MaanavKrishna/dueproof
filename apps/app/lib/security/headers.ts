/**
 * Security headers (05 §3 "Headers"). Pure functions, so the policy is unit
 * tested and the proxy only wires it up.
 *
 * Pages get a strict, nonce-based CSP with 'strict-dynamic': Next.js reads
 * the nonce from the request's CSP header and stamps it on its own scripts,
 * and nothing inline runs without it. That makes every page render per
 * request, which is right for the signed-in app (the website uses a
 * hash-based policy instead).
 *
 * `style-src-attr 'unsafe-inline'` allows style *attributes* only (React
 * renders `style={…}` as attributes, and Motion animates through them);
 * `<style>` elements still need the nonce.
 */

export interface CspOptions {
  nonce: string;
  /** Development: React needs eval for its debugging stacks. */
  dev: boolean;
  /** Served over https: upgrade stray http subresources. */
  https: boolean;
  /** Origins the browser talks to directly: signed storage URLs (uploads, page images). */
  storageOrigins: string[];
}

export function contentSecurityPolicy(o: CspOptions): string {
  const storage = o.storageOrigins.join(" ");
  const directives: Array<[string, string]> = [
    ["default-src", "'self'"],
    ["script-src", `'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`],
    // Dev: Turbopack injects CSS as <style> elements without the nonce; blocked, the
    // HMR client falls back to full reloads (a reload loop). A nonce makes browsers
    // ignore 'unsafe-inline', so development drops it. Production keeps the nonce.
    ["style-src", o.dev ? "'self' 'unsafe-inline'" : `'self' 'nonce-${o.nonce}'`],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", `'self' blob: data:${storage ? ` ${storage}` : ""}`],
    ["font-src", "'self'"],
    // Dev: Turbopack's HMR socket.
    ["connect-src", `'self'${storage ? ` ${storage}` : ""}${o.dev ? " ws: wss:" : ""}`],
    ["media-src", "'self' blob:"],
    ["worker-src", "'self' blob:"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v}`);
  if (o.https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** API responses are data, never documents: nothing may load or frame them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export interface CommonHeaderOptions {
  /** Send HSTS (only when the app is served over https). */
  https: boolean;
  /** Hosted: HSTS with preload (05 §3). Self-hosted gets HSTS without preload. */
  preload: boolean;
}

/** Headers for every response, page or API. */
export function commonSecurityHeaders(o: CommonHeaderOptions): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    // The camera is used through <input capture>, which needs no permission.
    "Permissions-Policy": [
      "accelerometer=()",
      "autoplay=()",
      "browsing-topics=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  };
  if (o.https) {
    h["Strict-Transport-Security"] = o.preload
      ? "max-age=63072000; includeSubDomains; preload"
      : "max-age=31536000; includeSubDomains";
  }
  return h;
}

/** A fresh 128-bit nonce, base64. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface StorageEnv {
  STORAGE_DRIVER: "local" | "s3" | "vercel-blob";
  S3_ENDPOINT?: string | undefined;
  S3_BUCKET?: string | undefined;
  S3_REGION?: string | undefined;
  S3_FORCE_PATH_STYLE?: boolean | undefined;
}

/**
 * The origin(s) signed storage URLs point at, for img-src and connect-src.
 * Local storage is served by the app itself ('self').
 */
export function storageOrigins(env: StorageEnv): string[] {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return [];
    case "vercel-blob":
      return ["https://*.blob.vercel-storage.com"];
    case "s3": {
      if (!env.S3_ENDPOINT) {
        const region = env.S3_REGION && env.S3_REGION !== "auto" ? env.S3_REGION : "us-east-1";
        return env.S3_BUCKET
          ? [`https://${env.S3_BUCKET}.s3.${region}.amazonaws.com`]
          : [`https://*.s3.${region}.amazonaws.com`];
      }
      const endpoint = new URL(env.S3_ENDPOINT);
      if (env.S3_FORCE_PATH_STYLE || !env.S3_BUCKET) return [endpoint.origin];
      return [`${endpoint.protocol}//${env.S3_BUCKET}.${endpoint.host}`, endpoint.origin];
    }
  }
}

/** The bare host names of storageOrigins (the Sandbox network policy wants hosts). */
export function storageHosts(env: StorageEnv): string[] {
  return storageOrigins(env).map((o) =>
    new URL(o.replace("*.", "wildcard.")).host.replace("wildcard.", "*."),
  );
}
