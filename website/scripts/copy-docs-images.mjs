// The docs pages are rendered from ../docs; their screenshots are copied in
// so the exported site is self-contained.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/docs-images", { recursive: true });
cpSync("../docs/images", "public/docs-images", { recursive: true });
