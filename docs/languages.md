# Languages

English is always read. Switch on any of the 22 languages IndicTrans2
translates:

```bash
DUEPROOF_LANGUAGES=hi,ta,bn dueproof serve
```

or set `LANGUAGES` in your [profile](profiles.md). `all` enables every one.

| Code | Language | Script | Tesseract pack | | Code | Language | Script | Tesseract pack |
|---|---|---|---|---|---|---|---|---|
| `hi` | Hindi | Devanagari | `hin` | | `as` | Assamese | Bengali | `asm` |
| `bn` | Bengali | Bengali | `ben` | | `mai` | Maithili | Devanagari | — |
| `mr` | Marathi | Devanagari | `mar` | | `sat` | Santali | Ol Chiki | — |
| `te` | Telugu | Telugu | `tel` | | `ks` | Kashmiri | Arabic | — |
| `ta` | Tamil | Tamil | `tam` | | `ne` | Nepali | Devanagari | `nep` |
| `gu` | Gujarati | Gujarati | `guj` | | `sd` | Sindhi | Arabic | `snd` |
| `ur` | Urdu | Arabic | `urd` | | `kok` | Konkani | Devanagari | — |
| `kn` | Kannada | Kannada | `kan` | | `doi` | Dogri | Devanagari | — |
| `or` | Odia | Odia | `ori` | | `mni` | Manipuri | Meetei Mayek | — |
| `ml` | Malayalam | Malayalam | `mal` | | `brx` | Bodo | Devanagari | — |
| `pa` | Punjabi | Gurmukhi | `pan` | | `sa` | Sanskrit | Devanagari | `san` |

## How a language works without any setup

Each non-English sentence is translated to English on your machine **before**
analysis, and the rules read the original and its translation together. So a
Tamil circular yields dated, routed obligations with no Tamil vocabulary
written by anyone. The quote that is outlined on the page — and the text a
reader can check — is always the original.

Translations are labelled *translated*. A translation that seems to have lost a
number or a known term (from the profile's `TERMS`) is flagged *check
terminology*. Dueproof never rewrites a translation to "fix" it.

Tested end to end with the real model: **Hindi, Tamil, Bengali, Urdu, Telugu
and Malayalam**. The other 16 use the same path and are not yet individually
tested — reports welcome.

## What each language needs

- **The translation weights** (one model for all 22) — see [Install](install.md).
  Without them a language is read, searched and displayed, but obligations are
  found only through the profile's own-language vocabulary.
- **For scans and photos, its Tesseract pack.** Only installed packs are used,
  and `dueproof doctor` lists what is missing. Seven languages have no
  Tesseract pack; they are read from PDFs with a text layer only.
- **Nothing for display**: the browser uses your system's fonts.

## Languages that share a script

Hindi, Marathi, Nepali, Sanskrit, Konkani, Maithili, Dogri and Bodo are all
written in Devanagari; Bengali and Assamese share a script, as do Urdu, Sindhi
and Kashmiri. Dueproof recognises a sentence's language by its script, so among
the languages you enable, **the first one listed claims its script**:
`DUEPROOF_LANGUAGES=mr,ta` reads Devanagari as Marathi.

## Going deeper for one language

A profile can add, for a language it cares about: month names
(`LOCAL_MONTHS`), how "within N days" is written (`LOCAL_RELATIVE`), how duties
and deadlines are worded (added to `OBLIGATION_CUES` and `DEADLINE_MARKERS`),
and terms to check translations against (`TERMS`). This makes extraction work
without the model and exact where a translation is not. `metro_rail_ml` does
this for Malayalam.

If text extraction damages a script — doubled vowel signs, combining marks
arriving as separate words, words split across lines — add a repair module to
`dueproof/pipeline/scripts/` and name it in `dueproof/languages.py`.
`malayalam.py` is the model.
