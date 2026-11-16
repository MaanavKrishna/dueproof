"""Every language Dueproof can read beside English: the 22 scheduled Indian
languages that IndicTrans2 translates into English.

For each: what it calls itself, the Unicode block of its script, its Tesseract
pack (None where Tesseract has none — such a language is read from PDFs with a
text layer, not from scans), its IndicTrans2 source tag, the font file that
renders it in an exported PDF if you add one to static/fonts/, and the repair
module in pipeline/scripts/ if extraction needs mending.

Turn languages on with DUEPROOF_LANGUAGES=hi,ta (or "all"), or a profile's
LANGUAGES list. Several languages share a script — Hindi, Marathi and Nepali
are all Devanagari — and script is how a sentence's language is recognised, so
among the languages you enable the first one listed claims its script.
"""
from __future__ import annotations

_DEVA, _BENG, _ARAB = "ऀ-ॿ", "ঀ-৿", "؀-ۿݐ-ݿ"

def _lang(name, english, script, ocr, mt, font, repair=None):
    return {"name": name, "english": english, "script": script, "ocr": ocr, "mt": mt,
            "font": font, "repair": repair}

LANGUAGES = {
    "hi": _lang("हिन्दी", "Hindi", _DEVA, "hin", "hin_Deva", "NotoSansDevanagari.ttf"),
    "bn": _lang("বাংলা", "Bengali", _BENG, "ben", "ben_Beng", "NotoSansBengali.ttf"),
    "mr": _lang("मराठी", "Marathi", _DEVA, "mar", "mar_Deva", "NotoSansDevanagari.ttf"),
    "te": _lang("తెలుగు", "Telugu", "ఀ-౿", "tel", "tel_Telu", "NotoSansTelugu.ttf"),
    "ta": _lang("தமிழ்", "Tamil", "஀-௿", "tam", "tam_Taml", "NotoSansTamil.ttf"),
    "gu": _lang("ગુજરાતી", "Gujarati", "઀-૿", "guj", "guj_Gujr", "NotoSansGujarati.ttf"),
    "ur": _lang("اردو", "Urdu", _ARAB, "urd", "urd_Arab", "NotoNaskhArabic.ttf"),
    "kn": _lang("ಕನ್ನಡ", "Kannada", "ಀ-೿", "kan", "kan_Knda", "NotoSansKannada.ttf"),
    "or": _lang("ଓଡ଼ିଆ", "Odia", "଀-୿", "ori", "ory_Orya", "NotoSansOriya.ttf"),
    "ml": _lang("മലയാളം", "Malayalam", "ഀ-ൿ", "mal", "mal_Mlym",
                "NotoSansMalayalam.ttf", repair="malayalam"),
    "pa": _lang("ਪੰਜਾਬੀ", "Punjabi", "਀-੿", "pan", "pan_Guru", "NotoSansGurmukhi.ttf"),
    "as": _lang("অসমীয়া", "Assamese", _BENG, "asm", "asm_Beng", "NotoSansBengali.ttf"),
    "mai": _lang("मैथिली", "Maithili", _DEVA, None, "mai_Deva", "NotoSansDevanagari.ttf"),
    "sat": _lang("ᱥᱟᱱᱛᱟᱲᱤ", "Santali", "᱐-᱿", None, "sat_Olck", "NotoSansOlChiki.ttf"),
    "ks": _lang("کٲشُر", "Kashmiri", _ARAB, None, "kas_Arab", "NotoNaskhArabic.ttf"),
    "ne": _lang("नेपाली", "Nepali", _DEVA, "nep", "npi_Deva", "NotoSansDevanagari.ttf"),
    "sd": _lang("سنڌي", "Sindhi", _ARAB, "snd", "snd_Arab", "NotoNaskhArabic.ttf"),
    "kok": _lang("कोंकणी", "Konkani", _DEVA, None, "gom_Deva", "NotoSansDevanagari.ttf"),
    "doi": _lang("डोगरी", "Dogri", _DEVA, None, "doi_Deva", "NotoSansDevanagari.ttf"),
    "mni": _lang("ꯃꯤꯇꯩꯂꯣꯟ", "Manipuri", "ꯀ-꯿", None, "mni_Mtei",
                 "NotoSansMeeteiMayek.ttf"),
    "brx": _lang("बड़ो", "Bodo", _DEVA, None, "brx_Deva", "NotoSansDevanagari.ttf"),
    "sa": _lang("संस्कृतम्", "Sanskrit", _DEVA, "san", "san_Deva", "NotoSansDevanagari.ttf"),
}

def enabled(codes: list[str]) -> list[dict]:
    """The languages to switch on, one per script, in the order given."""
    if [c.lower() for c in codes] == ["all"]:
        codes = list(LANGUAGES)
    out, claimed = [], set()
    for code in codes:
        if code not in LANGUAGES:
            raise SystemExit(f"Unknown language {code!r}. Known: {', '.join(LANGUAGES)}")
        lang = LANGUAGES[code]
        if lang["script"] not in claimed:
            claimed.add(lang["script"])
            out.append({"code": code, **lang})
    return out
