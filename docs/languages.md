# Languages

Dueproof's screens, emails and reports are in English (British spelling,
Indian number formats: ₹4,52,300, ₹4.52 lakh). The notices it reads can be
in English or any of the 22 scheduled Indian languages.

## The languages

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

The list lives in `services/engine/dueproof_engine/languages.py`.

## Your notice languages

Tell Dueproof which Indian languages your notices come in: tick them under
**Notice languages** in **Settings → Profiles**, or on the setup wizard's
**Notice types** step. Owners and admins can change them. English is always
read.

The languages you tick are sent to the engine with every notice:

- **Scans** are read with those languages' Tesseract packs as well as
  English.
- **Shared scripts** are settled by your choice: tick Marathi and a
  Devanagari line is taken as Marathi, not Hindi.

With none ticked, scans are read in English only.

## How a notice in another language is read

1. **Reading.** The engine reads the PDF's text layer in any script. Each
   page's language is recognised by its script.
2. **Translation.** Where offline translation is set up, lines in an Indian
   language are translated into English on your own server by IndicTrans2
   (one model, about 200 million parameters, for all 22). Only those lines
   are sent, each with its own language, so an English notice with a Tamil
   paragraph and a Hindi stamp is translated line by line. Nothing is sent
   anywhere.
3. **Finding.** The rules read the original and the English together, so a
   Tamil notice yields dated duties without anyone writing Tamil rules.
4. **Proof.** The quote outlined on the page is always the **original**
   wording. The case page shows the English with a *Machine translation*
   label, and lets you switch to the original.

Without translation, a notice in an Indian language is still read, stored,
searchable and shown, but the rules (written in English) won't find duties
in the Indian-language parts. Add those by hand, or turn on AI.

Search matches words as written, in any script.

## Where translation is available

| Running it | Translation |
|---|---|
| Self-hosted | Yes, once you install the weights: see [Install → Offline translation](install.md#offline-translation-optional). `/api/health` then shows `"translation": true`. Images built with `ENGINE_INSTALL_TRANSLATION=0` can't translate |
| Hosted | Only through engine-heavy, when its snapshot includes the weights. engine-fast can't translate |
| Desktop | Through the server it connects to |

## Scans and photos

The text layer is the reliable path. For scans, the OCR steps are PaddleOCR
and then Tesseract:

- The PaddleOCR models bundled in v0.1 read Latin script, not Indian
  scripts. An Indian-language scan is read poorly at this step and pulled
  below the confidence bar.
- Tesseract reads a language only if its pack is installed. The self-hosted
  engine image has Hindi, Malayalam and Tamil by default; add others with
  `ENGINE_OCR_PACKS`. Seven languages have no Tesseract pack and can be read
  only from PDFs with a text layer.
- The app asks the engine to OCR with your
  [notice languages](#your-notice-languages) and English, so the installed
  packs for those languages are used. A language you haven't ticked, or
  whose pack isn't installed, is read as English and usually lands below
  the bar.

A page still below the bar goes to **Needs review** (or, with AI on, to the
model).

## Languages that share a script

Hindi, Marathi, Nepali, Sanskrit, Konkani, Maithili, Dogri and Bodo are all
written in Devanagari; Bengali and Assamese share a script, as do Urdu,
Sindhi and Kashmiri. Since a line's language is recognised by its script,
one language claims each shared script. Set the engine's
`DUEPROOF_LANGUAGES` to put yours first: `DUEPROOF_LANGUAGES=mr,ta` reads
Devanagari as Marathi. The engine image sets `all`, which means the order
above: Devanagari is read as Hindi, Bengali script as Bengali, Arabic script
as Urdu.

Your [notice languages](#your-notice-languages) come first: a Devanagari
line is taken as the first of them written in Devanagari.

## Tested

The translation path has been tested end to end with the real model in
Hindi, Tamil, Bengali, Urdu, Telugu and Malayalam (in the 0.0.x engine,
which v0.1's engine carries forward). The other 16 use the same path and are
not yet tested one by one. Reports are welcome.
