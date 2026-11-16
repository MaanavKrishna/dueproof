import { describe, expect, it } from "vitest";
import {
  BUSINESS_FEATURES,
  FEATURE_LABELS,
  featureActive,
  isBusinessFeature,
  NO_LICENCE,
  V01_FEATURES,
} from "./index";

describe("plugin interface", () => {
  it("the free build has no active features", () => {
    for (const f of BUSINESS_FEATURES) expect(featureActive(NO_LICENCE, f)).toBe(false);
    expect(NO_LICENCE.state).toBe("none");
  });

  it("names every feature, and v0.1 builds a subset of them", () => {
    for (const f of BUSINESS_FEATURES) expect(FEATURE_LABELS[f]).toBeTruthy();
    for (const f of V01_FEATURES) expect(BUSINESS_FEATURES).toContain(f);
  });

  it("recognises known features only", () => {
    expect(isBusinessFeature("sso")).toBe(true);
    expect(isBusinessFeature("teleport")).toBe(false);
  });
});
