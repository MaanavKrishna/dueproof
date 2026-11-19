/**
 * Is a host on a private or internal network? For the SSO metadata URL the
 * server fetches (S2): it must be public, so an admin can't use it to probe
 * the server's own network. Names are resolved and every address checked.
 * A copy of apps/app/lib/net.ts: code outside ee/ never imports ee/, and ee/
 * doesn't import the app. A name that later resolves elsewhere (DNS
 * rebinding) is not caught here.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const)
  blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["64:ff9b::", 96], // NAT64 (embeds IPv4)
  ["2001:db8::", 32],
] as const)
  blocked.addSubnet(net, bits, "ipv6");

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const family = isIP(bare);
  if (family === 4) return blocked.check(bare, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms: check the IPv4 part.
    const mapped = bare.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1]) return blocked.check(mapped[1], "ipv4");
    const hex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex?.[1] && hex[2]) {
      const n = (Number.parseInt(hex[1], 16) << 16) | Number.parseInt(hex[2], 16);
      const v4 = [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
      return blocked.check(v4, "ipv4");
    }
    return blocked.check(bare, "ipv6");
  }
  return true; // not an address at all: treat as unsafe
}

export type Lookup = (host: string) => Promise<string[]>;

const systemLookup: Lookup = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Whether a host (name or address) is public: every address it resolves to
 * is outside private and internal ranges. A name that doesn't resolve is
 * not public.
 */
export async function isPublicHost(host: string, lookup: Lookup = systemLookup): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!bare || bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local"))
    return false;
  if (isIP(bare)) return !isPrivateAddress(bare);
  let addresses: string[];
  try {
    addresses = await lookup(bare);
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
}
