/**
 * Notice languages: the organisation's hints reach the engine's OCR (so
 * Indian-language scans use the installed Tesseract packs), and translation
 * sends only the lines not in English, each with its own language.
 */
import {
  createDatabase,
  type Database,
  documents,
  migrate,
  organization,
  pages,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import type { EngineClient } from "@dueproof/engine-client";
import { MemoryStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../lib/env";
import {
  knownLanguages,
  LANGUAGE_CODES,
  lineLanguageDetector,
  ocrLanguages,
} from "../lib/languages";
import { parseOrgMetadata } from "../lib/org-metadata";
import {
  escalateStage,
  readStage,
  translateStage,
  translationSegments,
} from "../lib/pipeline/stages";
import type { Container } from "../lib/server/container";

const words = (lines: string[]) =>
  lines.flatMap((text, line) =>
    text.split(" ").map((w) => ({
      text: w,
      rect: [0, 0, 1, 1] as [number, number, number, number],
      line,
    })),
  );

describe("language helpers", () => {
  it("knows the 22 scheduled languages and keeps only known codes", () => {
    expect(LANGUAGE_CODES).toHaveLength(22);
    expect(knownLanguages(["ml", "xx", "ml", 3, "hi"])).toEqual(["ml", "hi"]);
    expect(ocrLanguages(["ta"], ["hi", "en"])).toEqual(["ta", "hi", "en"]);
    expect(ocrLanguages([])).toEqual(["en"]);
  });

  it("reads the organisation's languages from metadata, defaulting to none", () => {
    expect(parseOrgMetadata(null).languages).toEqual([]);
    expect(parseOrgMetadata(JSON.stringify({ languages: ["ml", "zz"] })).languages).toEqual(["ml"]);
  });

  it("recognises each line's language by script", () => {
    const detect = lineLanguageDetector();
    expect(detect("Reply within 30 days of receipt of this notice")).toBe("en");
    expect(detect("ഈ നോട്ടീസ് ലഭിച്ച് 30 ദിവസത്തിനകം")).toBe("ml");
    expect(detect("இந்த அறிவிப்பு")).toBe("ta");
    expect(detect("सूचना प्राप्ति के 30 दिनों के भीतर")).toBe("hi");
    // A Latin line with one stray Indian character stays English.
    expect(detect("GSTIN 32ABCDE1234F1Z5 dated 01.04.2026 ऑ")).toBe("en");
    // Devanagari is claimed by the first preferred language that uses it.
    expect(lineLanguageDetector(["mr"])("सूचना प्राप्ति")).toBe("mr");
  });

  it("sends only the non-English lines, each tagged with its own language", () => {
    const segments = translationSegments(
      [
        {
          page: 1,
          words: words([
            "Notice under section 73",
            "ഈ നോട്ടീസ് ലഭിച്ച് 30 ദിവസത്തിനകം മറുപടി",
            "இந்த அறிவிப்பு கிடைத்த 15 நாட்களுக்குள்",
          ]),
        },
        { page: 2, words: words(["Signed, Superintendent", "सूचना प्राप्ति के भीतर"]) },
      ],
      [],
    );
    expect(segments).toEqual([
      { id: "1:1", text: "ഈ നോട്ടീസ് ലഭിച്ച് 30 ദിവസത്തിനകം മറുപടി", lang: "ml" },
      { id: "1:2", text: "இந்த அறிவிப்பு கிடைத்த 15 நாட்களுக்குள்", lang: "ta" },
      { id: "2:1", text: "सूचना प्राप्ति के भीतर", lang: "hi" },
    ]);
  });
});

describe("pipeline stages send the language hints", () => {
  let database: Database;
  const orgId = uuidv7();
  const documentId = uuidv7();
  const readRequests: Array<{ languages: string[] }> = [];
  const translateRequests: Array<{ segments: Array<{ id: string; lang: string }> }> = [];
  let c: Container;

  beforeAll(async () => {
    database = await createDatabase({ driver: "pglite" });
    await migrate(database);
    await unsafeRawDb(database)
      .insert(organization)
      .values({
        id: orgId,
        name: "Kochi Associates",
        slug: `org-${orgId.slice(-12)}`,
        createdAt: new Date(),
        metadata: JSON.stringify({ languages: ["ml", "ta"] }),
      });
    await withOrg(database, orgId, async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        orgId,
        filename: "scan.pdf",
        mime: "application/pdf",
        sizeBytes: 10,
        sha256: "b".repeat(64),
        storageKey: `org/${orgId}/originals/${"b".repeat(64)}`,
        pageCount: 1,
      });
      await tx.insert(pages).values({
        orgId,
        documentId,
        page: 1,
        width: 595,
        height: 842,
        text: "",
        words: words(["Reply to this notice", "ഈ നോട്ടീസ് ലഭിച്ച് 30 ദിവസത്തിനകം"]),
        engine: "tesseract",
        confidence: 0.9,
      });
    });
    const storage = new MemoryStorage();
    const engine = {
      async read(req: { languages: string[] }) {
        readRequests.push(req);
        return { pages: [], needsEscalation: [] };
      },
      async translate(req: { segments: Array<{ id: string; text: string; lang: string }> }) {
        translateRequests.push(req);
        return {
          segments: req.segments.map((s) => ({ id: s.id, textEn: `EN(${s.id})`, warn: false })),
          engine: "indictrans2",
        };
      },
    } as unknown as EngineClient;
    c = {
      env: parseEnv({ NODE_ENV: "test", AUTH_SECRET: "x".repeat(40) }),
      database,
      storage,
      engineStorage: storage,
      engine,
    } as unknown as Container;
  });
  afterAll(async () => {
    await database.close();
  });

  it("read asks for the organisation's languages and English", async () => {
    await readStage(c, { orgId, documentId }, 1);
    expect(readRequests.at(-1)?.languages).toEqual(["ml", "ta", "en"]);
  });

  it("escalation asks for the organisation's and the detected languages", async () => {
    const heavyReads: Array<{ languages: string[] }> = [];
    const withHeavy = {
      ...c,
      heavyEngine: {
        async read(req: { languages: string[] }) {
          heavyReads.push(req);
          return { pages: [], needsEscalation: [1] };
        },
      },
    } as unknown as Container;
    await escalateStage(
      withHeavy,
      { orgId, documentId },
      {
        pageCount: 1,
        languages: ["hi", "en"],
        needsTranslation: true,
        needsEscalation: [1],
        canEscalate: true,
      },
    );
    expect(heavyReads[0]?.languages).toEqual(["ml", "ta", "hi", "en"]);
  });

  it("translate sends only the Malayalam line", async () => {
    const out = await translateStage(c, { orgId, documentId }, ["ml", "en"]);
    expect(translateRequests.at(-1)?.segments.map((s) => [s.id, s.lang])).toEqual([["1:1", "ml"]]);
    expect(out).toEqual({ "1:1": "EN(1:1)" });
  });
});
