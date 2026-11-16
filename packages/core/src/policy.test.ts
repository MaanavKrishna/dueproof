import { describe, expect, it } from "vitest";
import { ACTIONS, type Action, authorize, can, PolicyDenied, policyMatrix, ROLES } from "./policy";

/**
 * The reviewed role × action matrix (default settings, all clients). Columns:
 * owner admin manager member viewer. Changing access means changing this table.
 */
const EXPECTED = `
case.view               Y Y Y Y Y
case.create             Y Y Y Y .
case.edit               Y Y Y Y .
case.assign             Y Y Y . .
case.change_stage       Y Y Y Y .
case.comment            Y Y Y Y .
document.upload         Y Y Y Y .
finding.review          Y Y Y Y .
deadline.edit           Y Y Y Y .
reply.draft             Y Y Y Y .
reply.request_approval  Y Y Y Y .
reply.approve           Y Y Y . .
client.view             Y Y Y Y Y
client.edit             Y Y Y . .
statutory.override      Y Y Y . .
exposure.view           Y Y Y . .
ai.use                  Y Y Y Y .
ai.manage_settings      Y Y . . .
team.view               Y Y Y Y Y
team.manage             Y Y . . .
org.manage_settings     Y Y . . .
billing.manage          Y . . . .
data.export             Y Y Y . .
audit.view              Y Y . . .
report.view             Y Y Y Y Y
`;

function parse(table: string): Record<string, boolean[]> {
  return Object.fromEntries(
    table
      .trim()
      .split("\n")
      .map((line) => {
        const [action, ...cells] = line.trim().split(/\s+/);
        return [action as string, cells.map((c) => c === "Y")];
      }),
  );
}

describe("role × action matrix", () => {
  const expected = parse(EXPECTED);
  const matrix = policyMatrix();

  it("lists every action exactly once", () => {
    expect(Object.keys(expected).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const [i, role] of ROLES.entries()) {
      const want = expected[action]?.[i];
      it(`${role} ${want ? "may" : "may not"} ${action}`, () => {
        expect(matrix[role][action]).toBe(want);
      });
    }
  }
});

describe("approving replies", () => {
  const manager = { userId: "u-mgr", role: "manager" as const };

  it("never by the person who asked", () => {
    expect(can(manager, "reply.approve", { requestedBy: "u-mgr" })).toBe(false);
    expect(can(manager, "reply.approve", { requestedBy: "u-junior" })).toBe(true);
    expect(can({ userId: "u-own", role: "owner" }, "reply.approve", { requestedBy: "u-own" })).toBe(
      false,
    );
  });

  it("refused when the requester is unknown", () => {
    expect(can(manager, "reply.approve", {})).toBe(false);
  });

  it("the permission can be granted to a member or withdrawn from a manager", () => {
    expect(
      can({ userId: "m", role: "member", mayApproveReplies: true }, "reply.approve", {
        requestedBy: "x",
      }),
    ).toBe(true);
    expect(
      can({ ...manager, mayApproveReplies: false }, "reply.approve", { requestedBy: "x" }),
    ).toBe(false);
  });

  it("never a viewer, even if granted", () => {
    expect(
      can({ userId: "v", role: "viewer", mayApproveReplies: true }, "reply.approve", {
        requestedBy: "x",
      }),
    ).toBe(false);
  });
});

describe("client-level grants", () => {
  const restricted = { userId: "u1", role: "member" as const, clientIds: ["c1", "c2"] };

  it("limits client-scoped actions to the granted clients", () => {
    expect(can(restricted, "case.view", { clientId: "c1" })).toBe(true);
    expect(can(restricted, "case.view", { clientId: "c3" })).toBe(false);
    expect(can(restricted, "document.upload", { clientId: "c3" })).toBe(false);
    expect(can(restricted, "document.upload", {})).toBe(true); // Inbox upload, no client yet
  });

  it("an empty grant list means no clients", () => {
    expect(can({ ...restricted, clientIds: [] }, "case.view", { clientId: "c1" })).toBe(false);
  });

  it("restricts managers' approvals too", () => {
    const mgr = { userId: "m", role: "manager" as const, clientIds: ["c1"] };
    expect(can(mgr, "reply.approve", { clientId: "c1", requestedBy: "x" })).toBe(true);
    expect(can(mgr, "reply.approve", { clientId: "c9", requestedBy: "x" })).toBe(false);
  });

  it("does not restrict owners and admins", () => {
    expect(
      can({ userId: "a", role: "admin", clientIds: [] }, "case.edit", { clientId: "c9" }),
    ).toBe(true);
  });

  it("does not grant what the role lacks", () => {
    expect(can({ ...restricted, clientIds: ["c1"] }, "client.edit", { clientId: "c1" })).toBe(
      false,
    );
  });
});

describe("deny by default", () => {
  it("unknown actions and roles are refused", () => {
    expect(can({ userId: "o", role: "owner" }, "case.delete" as Action)).toBe(false);
    expect(can({ userId: "o", role: "superuser" as "owner" }, "case.view")).toBe(false);
  });

  it("authorize throws PolicyDenied", () => {
    expect(() => authorize({ userId: "v", role: "viewer" }, "case.edit")).toThrow(PolicyDenied);
    expect(() => authorize({ userId: "o", role: "owner" }, "billing.manage")).not.toThrow();
  });
});
