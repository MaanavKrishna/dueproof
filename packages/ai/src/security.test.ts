import { describe, expect, it } from "vitest";
import {
  decryptApiKey,
  encryptApiKey,
  generateMasterKey,
  KeyError,
  loadMasterKey,
  maskKey,
  rewrapApiKey,
} from "./keys";
import { createRedactor, redact, restore, restoreDeep } from "./redact";

describe("envelope encryption of BYOK keys", () => {
  const master = loadMasterKey({ AI_KEY_MASTER: generateMasterKey() });
  const apiKey = "sk-ant-api03-EXAMPLEEXAMPLEEXAMPLE-abcd";

  it("round-trips and returns last4 for display", () => {
    const enc = encryptApiKey(apiKey, "org_1", master);
    expect(enc.last4).toBe("abcd");
    expect(maskKey(enc.last4)).toBe("sk-…abcd");
    expect(enc.ciphertext).not.toContain(apiKey);
    expect(enc.ciphertext).not.toContain("EXAMPLE");
    expect(decryptApiKey(enc.ciphertext, "org_1", master)).toBe(apiKey);
  });

  it("uses a fresh data key and IV every time", () => {
    const a = encryptApiKey(apiKey, "org_1", master).ciphertext;
    const b = encryptApiKey(apiKey, "org_1", master).ciphertext;
    expect(a).not.toBe(b);
  });

  it("binds the envelope to its organisation", () => {
    const enc = encryptApiKey(apiKey, "org_1", master);
    expect(() => decryptApiKey(enc.ciphertext, "org_2", master)).toThrow(KeyError);
  });

  it("fails on the wrong master key or a tampered envelope, without echoing the key", () => {
    const enc = encryptApiKey(apiKey, "org_1", master);
    const other = loadMasterKey({ AI_KEY_MASTER: generateMasterKey() });
    expect(() => decryptApiKey(enc.ciphertext, "org_1", other)).toThrow(KeyError);
    const parts = enc.ciphertext.split("~");
    const body = (parts[2] as string).split(".");
    body[2] = Buffer.from("tampered").toString("base64url");
    const tampered = `${parts[0]}~${parts[1]}~${body.join(".")}`;
    try {
      decryptApiKey(tampered, "org_1", master);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain(apiKey);
    }
  });

  it("re-wraps under a new master key", () => {
    const enc = encryptApiKey(apiKey, "org_1", master);
    const next = loadMasterKey({ AI_KEY_MASTER: generateMasterKey() });
    const rewrapped = rewrapApiKey(enc.ciphertext, "org_1", master, next);
    expect(decryptApiKey(rewrapped, "org_1", next)).toBe(apiKey);
    expect(() => decryptApiKey(rewrapped, "org_1", master)).toThrow(KeyError);
  });

  it("checks the master key's presence and length without printing it", () => {
    expect(() => loadMasterKey({})).toThrow(/not set/);
    expect(() => loadMasterKey({ AI_KEY_MASTER: Buffer.alloc(16).toString("base64") })).toThrow(
      /32 bytes/,
    );
  });
});

describe("PII redaction", () => {
  const text = [
    "GSTIN 29AAACH1234K1Z5 of Harbour Valley Components, PAN AAACH1234K.",
    "Aadhaar of the director: 2345 6789 0123.",
    "Refund to A/c No. 001234567890 at the Northline branch.",
    "Tax of Rs. 4,52,300 within 30 days; Reference No: ZD2910260012345.",
  ].join("\n");

  it("replaces PAN, Aadhaar and bank account numbers and restores them exactly", () => {
    const r = redact(text);
    expect(r.text).not.toContain("AAACH1234K");
    expect(r.text).not.toContain("2345 6789 0123");
    expect(r.text).not.toContain("001234567890");
    expect(r.text).toContain("⟦PAN_1⟧");
    expect(r.text).toContain("⟦AADHAAR_1⟧");
    expect(r.text).toContain("⟦BANK_1⟧");
    // Amounts and reference numbers are left alone.
    expect(r.text).toContain("Rs. 4,52,300");
    expect(r.text).toContain("ZD2910260012345");
    expect(restore(r.text, r.mapping)).toBe(text);
    // The same PAN (alone and inside the GSTIN) gets the same placeholder.
    expect(r.counts.PAN).toBe(1);
  });

  it("restores placeholders inside model output across pages", () => {
    const red = createRedactor();
    const p1 = red.redact("PAN AAACH1234K must reply.");
    const p2 = red.redact("Again AAACH1234K.");
    expect(p1).toContain("⟦PAN_1⟧");
    expect(p2).toContain("⟦PAN_1⟧");
    const out = restoreDeep({ findings: [{ quote: "PAN ⟦PAN_1⟧ must reply." }] }, red.mapping);
    expect(out.findings[0]?.quote).toBe("PAN AAACH1234K must reply.");
  });

  it("leaves unknown placeholders as they are", () => {
    expect(restore("⟦PAN_9⟧", new Map())).toBe("⟦PAN_9⟧");
  });
});
