import { describe, expect, it } from "vitest";
import {
  checkCin,
  checkGstin,
  checkPan,
  checkTan,
  gstinCheckCharacter,
  panOfGstin,
  stateCodeOfGstin,
} from "./index";

describe("identifiers", () => {
  it("accepts a GSTIN with the right check character and refuses a wrong one", () => {
    const first14 = "27AAACH1234A1Z";
    const good = `${first14}${gstinCheckCharacter(first14)}`;
    expect(checkGstin(good)).toEqual({ ok: true, value: good });
    expect(checkGstin(` ${good.toLowerCase()} `).ok).toBe(true);
    const wrong = `${first14}${gstinCheckCharacter(first14) === "A" ? "B" : "A"}`;
    expect(checkGstin(wrong)).toMatchObject({ ok: false, reason: /check character/ });
    expect(checkGstin("27AAACH1234A1")).toMatchObject({ ok: false, reason: /15 characters/ });
    expect(checkGstin("99AAACH1234A1ZX")).toMatchObject({ ok: false, reason: /state code/ });
    expect(panOfGstin(good)).toBe("AAACH1234A");
    expect(stateCodeOfGstin(good)).toBe("27");
  });

  it("checks a known published GSTIN", () => {
    // A commonly cited sample with a valid check character.
    expect(checkGstin("27AAPFU0939F1ZV").ok).toBe(true);
  });

  it("checks PAN, TAN and CIN shapes", () => {
    expect(checkPan("aaaph1234a").ok).toBe(true);
    expect(checkPan("AAAXH1234A")).toMatchObject({ ok: false });
    expect(checkPan("AAAPH123")).toMatchObject({ ok: false, reason: /10 characters/ });
    expect(checkTan("DELA12345B").ok).toBe(true);
    expect(checkTan("DEL12345B").ok).toBe(false);
    expect(checkCin("U15400MH2012PTC123456").ok).toBe(true);
    expect(checkCin("X15400MH2012PTC123456").ok).toBe(false);
  });
});
