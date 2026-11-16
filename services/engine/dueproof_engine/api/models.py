"""The engine's HTTP contract, mirrored from packages/contracts/src/engine.ts
(and the parts of date-rule.ts and domain.ts it uses). The TypeScript file is
the source of truth and is frozen; field names here are its camelCase names,
exactly. tests/test_contract.py reads the TypeScript and fails if the two
drift apart.

Zod's `.optional()` means "the key may be absent", not "null": responses are
serialised without None values (see app.py), so an absent optional is absent.
Unknown request keys are ignored, as Zod's z.object() strips them.
"""
from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

ENGINE_API_VERSION = "v1"


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


# domain.ts
IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
# [x0, y0, x1, y1] in PDF points from the page's top-left (pixels for an image).
Rect = tuple[float, float, float, float]
FindingKind = Literal["obligation", "deadline", "hearing", "amount", "reference", "office",
                      "section", "summary"]
Verification = Literal["exact", "strong", "approximate", "unlocated"]
PositiveInt = Annotated[int, Field(gt=0)]
NonNegativeInt = Annotated[int, Field(ge=0)]
Unit = Annotated[float, Field(ge=0, le=1)]

# date-rule.ts
Anchor = Literal["receipt", "issue", "order", "service", "hearing", "fixed"]
RelativeAnchor = Literal["receipt", "issue", "order", "service", "hearing"]


class FixedRule(_Model):
    """"on 18 November 2026\""""
    type: Literal["fixed"]
    date: IsoDate


class Condonable(_Model):
    amount: PositiveInt
    unit: Literal["days", "months"]


class RelativeRule(_Model):
    """"within 30 days of receipt", "within 3 months from the date of communication\""""
    type: Literal["relative"]
    anchor: RelativeAnchor
    amount: PositiveInt
    unit: Literal["days", "working_days", "months"]
    condonable: Condonable | None = None


class StatutoryRule(_Model):
    type: Literal["statutory"]
    ruleKey: str
    period: str


DateRule = Annotated[Union[FixedRule, RelativeRule, StatutoryRule], Field(discriminator="type")]


# engine.ts
SupportedMime = Literal["application/pdf", "image/jpeg", "image/png", "image/tiff"]
OcrEngine = Literal["text_layer", "paddleocr", "tesseract", "vision", "none"]


class InspectRequest(_Model):
    sourceUrl: str
    mime: SupportedMime
    password: str | None = None


class InspectResponse(_Model):
    ok: bool
    pageCount: NonNegativeInt
    encrypted: bool
    textLayerPages: list[PositiveInt]
    reason: str | None = None


class Word(_Model):
    text: str
    rect: Rect
    line: NonNegativeInt


class PageText(_Model):
    page: PositiveInt
    width: float
    height: float
    rotation: float = 0
    text: str
    words: list[Word]
    engine: OcrEngine
    confidence: Unit
    languages: list[str]


class ReadRequest(_Model):
    sourceUrl: str
    mime: SupportedMime
    password: str | None = None
    pageImagePutUrls: list[str]
    languages: list[str] = ["en"]
    maxRung: OcrEngine = "tesseract"


class ReadResponse(_Model):
    pages: list[PageText]
    needsEscalation: list[PositiveInt] = []


class TranslateSegment(_Model):
    id: str
    text: str
    lang: str


class TranslateRequest(_Model):
    segments: list[TranslateSegment]


class TranslatedSegment(_Model):
    id: str
    textEn: str
    warn: bool = False


class TranslateResponse(_Model):
    segments: list[TranslatedSegment]
    engine: Literal["indictrans2", "none"]


class EngineFinding(_Model):
    kind: FindingKind
    text: str
    textEn: str | None = None
    quote: str
    quoteLang: str = "en"
    pageHint: PositiveInt | None = None
    confidence: Unit
    dueRule: DateRule | None = None
    engineDueOn: IsoDate | None = None
    amountMinor: int | None = None
    desk: str | None = None
    severity: Literal["low", "medium", "high"] | None = None


class AnalyzeRequest(_Model):
    pages: list[PageText]
    translations: dict[str, str] = {}
    profile: str = "notices_in"
    receivedOn: IsoDate | None = None


class AnalyzeResponse(_Model):
    docType: str | None = None
    title: str | None = None
    reference: str | None = None
    issuingOffice: str | None = None
    issuedOn: IsoDate | None = None
    sections: list[str] = []
    findings: list[EngineFinding]
    confident: bool


class LinkQuote(_Model):
    id: str
    text: str
    pageHint: int | None = None


class LinkRequest(_Model):
    pages: list[PageText]
    quotes: list[LinkQuote]


class LinkMatch(_Model):
    id: str
    page: PositiveInt | None = None
    rects: list[Rect]
    score: Unit
    grade: Verification


class LinkResponse(_Model):
    matches: list[LinkMatch]


# Not in the contract: the error body of a non-2xx response.
class ErrorBody(_Model):
    error: str
    reason: str | None = None
    message: str | None = None


# The Zod schema each model mirrors, for tests/test_contract.py.
MIRRORS: dict[str, type[BaseModel]] = {
    "InspectRequest": InspectRequest, "InspectResponse": InspectResponse, "Word": Word,
    "PageText": PageText, "ReadRequest": ReadRequest, "ReadResponse": ReadResponse,
    "TranslateRequest": TranslateRequest, "TranslateResponse": TranslateResponse,
    "EngineFinding": EngineFinding, "AnalyzeRequest": AnalyzeRequest,
    "AnalyzeResponse": AnalyzeResponse, "LinkRequest": LinkRequest, "LinkResponse": LinkResponse,
}
