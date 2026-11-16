import { readFileSync } from "node:fs";
import { featureActive, LicenceFileError } from "@dueproof/plugins";
import { describe, expect, it } from "vitest";
import { TEST_KEY, testKeyAllowed, trustedKeys } from "./keys";
import { evaluateLicence, issueLicence, type LicencePayload, parseLicenceFile } from "./licence";

const key = (name: string) => readFileSync(new URL(`./test-keys/${name}`, import.meta.url), "utf8");
const TEST_PRIVATE = key("test-current.private.pem");
const OTHER_PRIVATE = key("test-other.private.pem");
const keys = [TEST_KEY];

const payload: LicencePayload = {
  v: 1,
  licenceId: "lic_test_0001",
  licensee: "Sharma & Co",
  orgName: "Sharma & Co Chartered Accountants",
  features: ["sso", "audit-export", "white-label", "teleport"],
  seats: 25,
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
};

const at = (iso: string) => ({ now: new Date(iso), keys });

describe("licence verification", () => {
  const { file, stored } = issueLicence(payload, TEST_PRIVATE, TEST_KEY.id);

  it("round-trips through the file format", () => {
    expect(parseLicenceFile(file)).toEqual(stored);
  });

  it("verifies a valid licence offline and lists its known features", () => {
    const s = evaluateLicence(stored, at("2026-06-01T00:00:00Z"));
    expect(s.state).toBe("valid");
    expect(s.licence?.licensee).toBe("Sharma & Co");
    expect(s.licence?.seats).toBe(25);
    expect(s.active).toEqual(["sso", "audit-export", "white-label"]);
    // Unknown features are kept for display, never switched on.
    expect(s.licence?.features).toContain("teleport");
    expect(featureActive(s, "sso")).toBe(true);
    expect(featureActive(s, "scim")).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const tampered = {
      ...stored,
      payload: stored.payload.replace("2027-01-01", "2099-01-01"),
    };
    const s = evaluateLicence(tampered, at("2026-06-01T00:00:00Z"));
    expect(s.state).toBe("invalid");
    expect(s.active).toEqual([]);
    expect(s.licence).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const sig = Buffer.from(stored.signature, "base64");
    sig[0] = (sig[0] ?? 0) ^ 0xff;
    const s = evaluateLicence(
      { ...stored, signature: sig.toString("base64") },
      at("2026-06-01T00:00:00Z"),
    );
    expect(s.state).toBe("invalid");
  });

  it("rejects a licence signed with a key the app doesn't trust", () => {
    const other = issueLicence(payload, OTHER_PRIVATE, "test-other").stored;
    expect(evaluateLicence(other, at("2026-06-01T00:00:00Z")).state).toBe("invalid");
  });

  it("warns in the 30 days before expiry", () => {
    const s = evaluateLicence(stored, at("2026-12-15T00:00:00Z"));
    expect(s.state).toBe("expiring");
    expect(s.daysLeft).toBe(17);
    expect(s.active).toContain("sso");
  });

  it("keeps features on for 30 days of grace after expiry", () => {
    const s = evaluateLicence(stored, at("2027-01-10T00:00:00Z"));
    expect(s.state).toBe("grace");
    expect(s.daysLeft).toBe(21);
    expect(s.graceEndsAt).toBe("2027-01-31T00:00:00.000Z");
    expect(s.active).toContain("white-label");
    expect(s.problem).toMatch(/expired/);
  });

  it("switches features off cleanly when grace ends", () => {
    const s = evaluateLicence(stored, at("2027-01-31T00:00:01Z"));
    expect(s.state).toBe("expired");
    expect(s.active).toEqual([]);
    expect(s.licence?.licenceId).toBe("lic_test_0001");
  });

  it("treats a clock set far back as expired", () => {
    const s = evaluateLicence(stored, {
      ...at("2026-03-01T00:00:00Z"),
      latestSeenAt: new Date("2026-05-01T00:00:00Z"),
    });
    expect(s.state).toBe("expired");
    expect(s.problem).toMatch(/clock/);
    // A few hours of drift is forgiven.
    const ok = evaluateLicence(stored, {
      ...at("2026-05-01T00:00:00Z"),
      latestSeenAt: new Date("2026-05-01T06:00:00Z"),
    });
    expect(ok.state).toBe("valid");
  });

  it("has no state without a licence", () => {
    expect(evaluateLicence(null, at("2026-06-01T00:00:00Z")).state).toBe("none");
  });

  it("refuses files that aren't licences, with a plain message", () => {
    expect(() => parseLicenceFile("hello")).toThrow(LicenceFileError);
    expect(() => parseLicenceFile(JSON.stringify({ dueproofLicence: 2 }))).toThrow(
      /isn't a Dueproof licence/,
    );
    expect(() => parseLicenceFile("x".repeat(20_000))).toThrow(/too large/);
  });

  it("refuses to issue an expiry before the issue date", () => {
    expect(() =>
      issueLicence({ ...payload, expiresAt: "2025-01-01T00:00:00Z" }, TEST_PRIVATE, "t"),
    ).toThrow();
  });
});

describe("trusted keys", () => {
  it("never trusts the test key in production", () => {
    expect(testKeyAllowed({ NODE_ENV: "production", DUEPROOF_LICENCE_TEST_KEYS: "1" })).toBe(false);
    expect(trustedKeys({ NODE_ENV: "production" })).not.toContainEqual(TEST_KEY);
  });

  it("trusts it under test, or in development when asked", () => {
    expect(testKeyAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(testKeyAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(testKeyAllowed({ NODE_ENV: "development", DUEPROOF_LICENCE_TEST_KEYS: "1" })).toBe(true);
  });
});
