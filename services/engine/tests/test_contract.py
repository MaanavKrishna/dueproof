"""The Pydantic models must say what packages/contracts/src/engine.ts says.

The TypeScript (Zod) file is the frozen source of truth. This test reads it,
pulls out every `export const X = z.object({...})` and `z.enum([...])`, and
compares top-level field names, which fields are optional, and enum values
with dueproof_engine/api/models.py. It also validates the recorded fixtures
(fixtures/recorded/) against the models, so the TypeScript lanes build
against responses that really match.
"""
import json
import re
import typing
import unittest
from pathlib import Path

from pydantic import TypeAdapter

from dueproof_engine.api import models as m

ENGINE = Path(__file__).resolve().parent.parent
CONTRACTS = ENGINE.parent.parent / "packages" / "contracts" / "src"
RECORDED = ENGINE / "fixtures" / "recorded"


def _block(src: str, start: int, open_ch: str, close_ch: str) -> str:
    depth = 0
    for i in range(start, len(src)):
        if src[i] == open_ch:
            depth += 1
        elif src[i] == close_ch:
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
    raise ValueError("unbalanced")


def _top_level_fields(body: str) -> dict[str, bool]:
    """{field: optional} for the object literal's own keys (depth 0 only)."""
    body = re.sub(r"/\*.*?\*/|//[^\n]*", "", body, flags=re.S)
    fields, depth = {}, 0
    entries, cur = [], ""
    for ch in body:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            entries.append(cur)
            cur = ""
        else:
            cur += ch
    entries.append(cur)
    for e in entries:
        if mt := re.match(r"\s*(\w+)\s*:\s*(.*)", e, re.S):
            # Only the outermost call chain decides: z.array(z.object({x: ...optional()}))
            # is itself required.
            outer, d = "", 0
            for ch in mt[2]:
                if ch in "([{":
                    d += 1
                elif ch in ")]}":
                    d -= 1
                elif d == 0:
                    outer += ch
            fields[mt[1]] = bool(re.search(r"\.(optional|default)\b", outer))
    return fields


def zod_objects() -> dict[str, dict[str, bool]]:
    src = (CONTRACTS / "engine.ts").read_text(encoding="utf-8")
    out = {}
    for mt in re.finditer(r"export const (\w+) = z\.object\(", src):
        brace = src.index("{", mt.end() - 1)
        out[mt[1]] = _top_level_fields(_block(src, brace, "{", "}"))
    return out


def zod_enums() -> dict[str, list[str]]:
    out = {}
    for name in ("engine.ts", "domain.ts", "date-rule.ts"):
        src = (CONTRACTS / name).read_text(encoding="utf-8")
        for mt in re.finditer(r"export const (\w+) = z\.enum\(\[([^\]]*)\]", src):
            out[mt[1]] = re.findall(r'"([^"]+)"', mt[2])
    return out


@unittest.skipUnless((CONTRACTS / "engine.ts").is_file(), "packages/contracts is not checked out")
class FieldNames(unittest.TestCase):
    def test_every_engine_schema_is_mirrored(self):
        self.assertEqual(sorted(zod_objects()), sorted(m.MIRRORS))

    def test_field_names_and_optionality_match(self):
        for name, fields in zod_objects().items():
            model = m.MIRRORS[name]
            with self.subTest(schema=name):
                self.assertEqual(sorted(model.model_fields), sorted(fields))
                for field, optional in fields.items():
                    self.assertEqual(not model.model_fields[field].is_required(), optional, field)

    def test_enums_match(self):
        enums = zod_enums()
        mirror = {"SupportedMime": m.SupportedMime, "OcrEngine": m.OcrEngine,
                  "FindingKind": m.FindingKind, "Verification": m.Verification, "Anchor": m.Anchor}
        for name, lit in mirror.items():
            with self.subTest(enum=name):
                self.assertEqual(list(typing.get_args(lit)), enums[name])

    def test_date_rule_shapes(self):
        src = (CONTRACTS / "date-rule.ts").read_text(encoding="utf-8")
        body = _block(src, src.index("[", src.index("z.discriminatedUnion")), "[", "]")
        shapes = [_top_level_fields(_block(body, mt.end() - 1, "{", "}"))
                  for mt in re.finditer(r"z\.object\(\{", body)]
        mine = [m.FixedRule, m.RelativeRule, m.StatutoryRule]
        self.assertEqual([sorted(s) for s in shapes], [sorted(x.model_fields) for x in mine])
        for shape, model in zip(shapes, mine):
            for field, optional in shape.items():
                self.assertEqual(not model.model_fields[field].is_required(), optional, field)


class Recorded(unittest.TestCase):
    """The fixtures the TypeScript lanes build against parse as the contract."""
    MODELS = {"inspect": m.InspectResponse, "read": m.ReadResponse, "analyze": m.AnalyzeResponse,
              "link": m.LinkResponse}

    def test_recorded_responses_validate(self):
        files = sorted(RECORDED.glob("*.json"))
        self.assertTrue(files, "no recorded fixtures; run scripts/record_fixtures.py")
        for path in files:
            endpoint = path.stem.rsplit(".", 1)[-1]
            with self.subTest(file=path.name):
                data = json.loads(path.read_text(encoding="utf-8"))
                TypeAdapter(self.MODELS[endpoint]).validate_python(data)
                self.assertNotIn("null", path.read_text(encoding="utf-8").replace('"null"', ""))


if __name__ == "__main__":
    unittest.main()
