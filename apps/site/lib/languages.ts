// The 22 languages of the Eighth Schedule, which Dueproof reads besides
// English. Per-language OCR quality is measured in the v0.1 bake-off and is
// not claimed here until it is published.
export type Language = {
  code: string;
  name: string;
  english: string;
  script: string;
  rtl?: boolean;
};

const L = (code: string, name: string, english: string, script: string, rtl = false): Language => ({
  code,
  name,
  english,
  script,
  ...(rtl ? { rtl } : {}),
});

export const LANGUAGES: Language[] = [
  L("as", "অসমীয়া", "Assamese", "Bengali–Assamese"),
  L("bn", "বাংলা", "Bengali", "Bengali–Assamese"),
  L("brx", "बड़ो", "Bodo", "Devanagari"),
  L("doi", "डोगरी", "Dogri", "Devanagari"),
  L("gu", "ગુજરાતી", "Gujarati", "Gujarati"),
  L("hi", "हिन्दी", "Hindi", "Devanagari"),
  L("kn", "ಕನ್ನಡ", "Kannada", "Kannada"),
  L("ks", "کٲشُر", "Kashmiri", "Perso-Arabic", true),
  L("kok", "कोंकणी", "Konkani", "Devanagari"),
  L("mai", "मैथिली", "Maithili", "Devanagari"),
  L("ml", "മലയാളം", "Malayalam", "Malayalam"),
  L("mni", "ꯃꯤꯇꯩꯂꯣꯟ", "Manipuri", "Meetei Mayek"),
  L("mr", "मराठी", "Marathi", "Devanagari"),
  L("ne", "नेपाली", "Nepali", "Devanagari"),
  L("or", "ଓଡ଼ିଆ", "Odia", "Odia"),
  L("pa", "ਪੰਜਾਬੀ", "Punjabi", "Gurmukhi"),
  L("sa", "संस्कृतम्", "Sanskrit", "Devanagari"),
  L("sat", "ᱥᱟᱱᱛᱟᱲᱤ", "Santali", "Ol Chiki"),
  L("sd", "سنڌي", "Sindhi", "Perso-Arabic", true),
  L("ta", "தமிழ்", "Tamil", "Tamil"),
  L("te", "తెలుగు", "Telugu", "Telugu"),
  L("ur", "اردو", "Urdu", "Perso-Arabic", true),
];
