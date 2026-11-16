// Mirrors dueproof/languages.py. `scans`: Tesseract has an OCR pack, so
// photographs and scans are read; otherwise only PDFs with a text layer.
// `tested`: checked end to end with the real translation model.
export type Language = { code: string; name: string; english: string; scans: boolean; tested: boolean };

const L = (code: string, name: string, english: string, scans: boolean, tested = false): Language =>
  ({ code, name, english, scans, tested });

export const LANGUAGES: Language[] = [
  L("hi", "हिन्दी", "Hindi", true, true),
  L("bn", "বাংলা", "Bengali", true, true),
  L("mr", "मराठी", "Marathi", true),
  L("te", "తెలుగు", "Telugu", true, true),
  L("ta", "தமிழ்", "Tamil", true, true),
  L("gu", "ગુજરાતી", "Gujarati", true),
  L("ur", "اردو", "Urdu", true, true),
  L("kn", "ಕನ್ನಡ", "Kannada", true),
  L("or", "ଓଡ଼ିଆ", "Odia", true),
  L("ml", "മലയാളം", "Malayalam", true, true),
  L("pa", "ਪੰਜਾਬੀ", "Punjabi", true),
  L("as", "অসমীয়া", "Assamese", true),
  L("mai", "मैथिली", "Maithili", false),
  L("sat", "ᱥᱟᱱᱛᱟᱲᱤ", "Santali", false),
  L("ks", "کٲشُر", "Kashmiri", false),
  L("ne", "नेपाली", "Nepali", true),
  L("sd", "سنڌي", "Sindhi", true),
  L("kok", "कोंकणी", "Konkani", false),
  L("doi", "डोगरी", "Dogri", false),
  L("mni", "ꯃꯤꯇꯩꯂꯣꯟ", "Manipuri", false),
  L("brx", "बड़ो", "Bodo", false),
  L("sa", "संस्कृतम्", "Sanskrit", true),
];

export const RTL = new Set(["ur", "ks", "sd"]);
