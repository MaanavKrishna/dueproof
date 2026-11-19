import { describe, expect, it } from "vitest";
import { plural } from "../lib/plural";

describe("plural", () => {
  it("says 1 client, never 1 clients", () => {
    expect(plural(0, "client")).toBe("0 clients");
    expect(plural(1, "client")).toBe("1 client");
    expect(plural(2, "row")).toBe("2 rows");
    expect(plural(1200, "client")).toBe("1,200 clients");
    expect(plural(1, "person", "people")).toBe("1 person");
    expect(plural(3, "person", "people")).toBe("3 people");
  });
});
