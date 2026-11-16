import { createHash } from "node:crypto";
import { auditHash } from "@dueproof/db";
import type { AuditExportRow } from "@dueproof/plugins";
import { describe, expect, it } from "vitest";
import { buildAuditExport, checkChain, verifyAuditExport } from "./audit-export";

const ORG = "org_1";

function chain(n: number): AuditExportRow[] {
  const rows: AuditExportRow[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const fields = {
      orgId: ORG,
      at: new Date(Date.UTC(2026, 0, i, 10)),
      actor: i % 2 ? "user_a" : null,
      action: i === 3 ? "member.join" : "org.settings.update",
      targetType: "organisation",
      targetId: ORG,
      requestId: `req_${i}`,
      detail: i === 4 ? { fields: ["name"], note: "=SUM(A1)" } : { n: i },
      prevHash: prev,
    };
    const hash = auditHash(fields);
    rows.push({ id: i, ...fields, hash });
    prev = hash;
  }
  return rows;
}

const now = new Date("2026-02-01T00:00:00Z");

describe("audit export", () => {
  it("exports the whole chain as JSONL that verifies on its own", () => {
    const rows = chain(6);
    const out = buildAuditExport({
      orgId: ORG,
      chain: rows,
      from: null,
      to: null,
      format: "jsonl",
      now,
    });
    expect(out.report.count).toBe(6);
    expect(out.report.chain).toEqual({ ok: true, checked: 6, brokenAt: null });
    expect(out.report.anchorHash).toBeNull();
    expect(out.report.lastHash).toBe(rows[5]?.hash);
    expect(out.filename).toBe("dueproof-audit-start-to-2026-02-01.jsonl");
    expect(verifyAuditExport(out.body, out.report)).toBeNull();
  });

  it("anchors a date range to the entry before it, and checks the chain from the start", () => {
    const rows = chain(8);
    const out = buildAuditExport({
      orgId: ORG,
      chain: rows,
      from: new Date("2026-01-03T00:00:00Z"),
      to: new Date("2026-01-05T23:59:59Z"),
      format: "jsonl",
      now,
    });
    expect(out.report.count).toBe(3);
    expect(out.report.firstId).toBe(3);
    expect(out.report.lastId).toBe(5);
    expect(out.report.anchorHash).toBe(rows[1]?.hash);
    expect(out.report.chain.checked).toBe(5);
    expect(verifyAuditExport(out.body, out.report)).toBeNull();
  });

  it("finds an edited entry, both in the database chain and in the file", () => {
    const rows = chain(5);
    const edited = rows.map((r) => (r.id === 3 ? { ...r, action: "member.remove" } : r));
    expect(checkChain(edited)).toEqual({ ok: false, checked: 5, brokenAt: 3 });
    const out = buildAuditExport({
      orgId: ORG,
      chain: edited,
      from: null,
      to: null,
      format: "jsonl",
      now,
    });
    expect(out.report.chain.ok).toBe(false);

    const good = buildAuditExport({
      orgId: ORG,
      chain: rows,
      from: null,
      to: null,
      format: "jsonl",
      now,
    });
    const tampered = good.body.replace('"action":"member.join"', '"action":"member.remove"');
    expect(verifyAuditExport(tampered, good.report)).toMatch(/sha256/);
    const resealed = {
      ...good.report,
      fileSha256: createHash("sha256").update(tampered).digest("hex"),
    };
    expect(verifyAuditExport(tampered, resealed)).toMatch(/Entry 3 was changed/);
  });

  it("finds a deleted entry", () => {
    const rows = chain(5).filter((r) => r.id !== 2);
    expect(checkChain(rows)).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("writes CSV with the hashes, safe to open in a spreadsheet", () => {
    const out = buildAuditExport({
      orgId: ORG,
      chain: chain(4),
      from: null,
      to: null,
      format: "csv",
      now,
    });
    const lines = out.body.trim().split("\r\n");
    expect(lines[0]).toBe(
      "id,at,actor,action,target_type,target_id,request_id,detail,prev_hash,hash",
    );
    expect(lines).toHaveLength(5);
    expect(out.contentType).toMatch(/text\/csv/);
    // The JSON detail is quoted; nothing in it starts a formula cell.
    expect(lines[4]).toContain('"{""fields"":[""name""],""note"":""=SUM(A1)""}"');
    expect(out.report.fileFormat).toBe("csv");
    expect(verifyAuditExport(out.body, out.report)).toMatch(/Only the JSONL/);
  });

  it("exports an empty range without inventing anything", () => {
    const out = buildAuditExport({
      orgId: ORG,
      chain: chain(3),
      from: new Date("2027-01-01T00:00:00Z"),
      to: null,
      format: "jsonl",
      now,
    });
    expect(out.body).toBe("");
    expect(out.report.count).toBe(0);
    expect(out.report.chain.ok).toBe(true);
  });
});
