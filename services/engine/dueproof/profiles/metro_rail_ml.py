"""Example of a domain-specific, bilingual profile: a metro rail operator that
issues documents in Malayalam and English.

It shows the optional depth a profile can add for one language: how duties and
deadlines are phrased in it, its month names, and the terminology a
translation is checked against. None of that is required to read a language —
see general.py with DUEPROOF_LANGUAGES set.
"""
from dueproof.profiles import english

ORG_NAME = "Metro Rail"
TIMEZONE = "Asia/Kolkata"
CHANNELS = ["Email", "SharePoint", "WhatsApp", "Maximo", "Scan", "Upload"]

# --- Languages -------------------------------------------------------------
LANGUAGES = ["ml"]                      # codes from dueproof.languages.py

# Own-language vocabulary is optional — with translation available, Malayalam
# sentences are also judged on their English — but it makes extraction work
# without the translation model, and it is exact where a translation is not.
LOCAL_MONTHS = {"ജനുവരി": 1, "ഫെബ്രുവരി": 2, "മാർച്ച്": 3, "ഏപ്രിൽ": 4, "മേയ്": 5, "മെയ്": 5,
                "ജൂൺ": 6, "ജൂലൈ": 7, "ഓഗസ്റ്റ്": 8, "ആഗസ്റ്റ്": 8, "സെപ്റ്റംബർ": 9,
                "ഒക്ടോബർ": 10, "ഒക്‌ടോബർ": 10, "നവംബർ": 11, "ഡിസംബർ": 12}
LOCAL_RELATIVE = r"(\d{1,3})\s*ദിവസ"    # "15 ദിവസത്തിനകം": within 15 days

# --- Desks, and the words that route a finding to them ---------------------
ROLES = [
    "Safety Officer", "Station Controller", "Rolling Stock Engineer",
    "Signalling & Telecom", "Civil & Infrastructure", "Operations Control Centre",
    "Procurement", "Finance", "Human Resources", "Legal & Compliance",
]
DEFAULT_ROLE = "Operations Control Centre"

ROLE_KEYWORDS = {
    "Safety Officer": ["fire", "safety", "evacuat", "hazard", "emergency",
                       "extinguish", "drill", "അഗ്നി", "സുരക്ഷ", "അപകട"],
    "Station Controller": ["station", "platform", "concourse", "passenger", "crowd",
                           "gate", "സ്റ്റേഷൻ", "പ്ലാറ്റ്ഫോം", "യാത്രക്കാര"],
    "Rolling Stock Engineer": ["rolling stock", "bogie", "traction", "brake", "trainset",
                               "coach", "depot", "wheel", "pantograph", "ട്രെയിൻ", "ബ്രേക്ക്"],
    "Signalling & Telecom": ["signal", "telecom", "cbtc", "interlock", "scada", "radio",
                             "atp", "സിഗ്നൽ"],
    "Civil & Infrastructure": ["viaduct", "elevated", "structur", "civil", "bridge",
                               "pier", "girder", "tunnel", "പാലം"],
    "Operations Control Centre": ["control centre", "control room", "occ", "headway",
                                  "timetable", "service", "dispatch"],
    "Procurement": ["tender", "vendor", "procure", "purchase order", "quotation",
                    "supply", "contract", "ടെൻഡർ"],
    "Finance": ["invoice", "payment", "budget", "cost", "crore", "lakh", "gst", "₹", "financ"],
    "Human Resources": ["employee", "staff", "leave", "training", "recruit", "payroll",
                        "hr ", "ജീവനക്കാർ", "പരിശീലന"],
    "Legal & Compliance": ["compliance", "statutory", "regulation", "cmrs", "mohua",
                           "act,", "clause", "penalt", "audit", "നിയമ"],
}

# --- Document types --------------------------------------------------------
DEFAULT_DOC_TYPE = "Safety directive"
DOC_TYPE_KEYWORDS = {
    "Safety directive": ["safety directive", "fire safety", "safety circular",
                         "സുരക്ഷാ സർക്കുലർ", "അഗ്നിസുരക്ഷ"],
    "Regulatory directive": ["commissioner of metro rail safety", "ministry of housing",
                             "statutory directive", "mohua"],
    "Maintenance job card": ["job card", "work order", "maximo", "maintenance schedule",
                             "preventive maintenance", "asset id"],
    "Incident report": ["incident report", "near miss", "occurrence report", "derail"],
    "Vendor invoice": ["invoice no", "tax invoice", "invoice", "gstin"],
    "Purchase order": ["purchase order", "p.o. no"],
    "HR policy": ["hr policy", "hr circular", "leave policy", "code of conduct",
                  "establishment order", "retraining"],
    "Board minutes": ["minutes of the", "board meeting", "board of directors", "resolved that"],
    "Engineering change note": ["change note", "engineering change", "drawing rev"],
    "Environmental study": ["environmental", "emission", "effluent", "eia", "pollution control"],
    "Legal opinion": ["legal opinion", "arbitration", "writ petition"],
}

# --- Duties, urgency, deadlines --------------------------------------------
OBLIGATION_CUES = english.OBLIGATION_CUES + [
    "നൽകണം", "സമർപ്പിക്കണം", "ഉറപ്പാക്കണം", "വേണം", "നിർബന്ധമാണ്", "പൂർത്തിയാക്ക",
    "റിപ്പോർട്ട്", "അന്തിമ തീയതി", "നടത്തണം", "പരിശോധിക്ക", "ചെയ്യണം", "മുമ്പ്",
    "കൈമാറേണ്ടത", "ഏർപ്പെടുത്തേണ്ട", "രേഖപ്പെടുത്തേണ്ട", "അറിയിക്കണം", "മാറ്റിസ്ഥാപിക്ക"]
SEVERITY_HIGH = english.SEVERITY_HIGH + ["അടിയന്തര", "നിർബന്ധ"]
DEADLINE_MARKERS = english.DEADLINE_MARKERS + ["മുമ്പ്", "നകം", "അകം", "അന്തിമ", "വരെയായി"]
MODAL_MARKERS = ["shall", "must", "ണം"]        # "ണം": the Malayalam obligative ending
INFO_TERMS = english.INFO_TERMS + ["station", "train", "സ്റ്റേഷൻ", "സുരക്ഷ", "റിപ്പോർട്ട്", "പരിശോധന"]
SUBJECT_WORDS = ["subject", "sub", "വിഷയം"]
TITLE_STOPS = ["പ്രതി", "To", "Ref", "Copy to"]

# --- Terminology the translation is checked against ------------------------
# Local term (or stem) -> the English a correct translation would contain, any
# one of them. This is a CHECK, never a substitution: if the source has the term
# and the translation has none of its equivalents, the finding is flagged "check
# terminology" and the reader is pointed at the original. Rewriting the output
# would mean substituting inside agglutinated compounds, which produces fluent,
# confident, wrong English.
TERMS = {
    "കമ്മീഷണർ ഓഫ് മെട്രോ": ["commissioner of metro", "cmrs"],
    "ചീഫ് സേഫ്റ്റി ഓഫീസർ": ["chief safety officer"],
    "സ്റ്റേഷൻ കൺട്രോളർ": ["station controller"],
    "സ്റ്റേഷൻ": ["station"], "സ്റ്റേഷന": ["station"],
    "പ്ലാറ്റ്ഫോം": ["platform"], "പ്ലാറ്റ്ഫോമ": ["platform"],
    "എലിവേറ്റഡ്": ["elevated"], "ഡിപ്പോ": ["depot"],
    "ട്രെയിൻ": ["train"], "ട്രെയിന": ["train"],
    "ബ്രേക്ക്": ["brake"], "സിഗ്നൽ": ["signal"], "എസ്കലേറ്റർ": ["escalator"],
    "അഗ്നിസുരക്ഷ": ["fire safety", "fire"], "അഗ്നിശമന": ["fire", "extinguish"],
    "ഓഡിറ്റ്": ["audit"], "ടെൻഡർ": ["tender"], "ഇൻവോയ്സ്": ["invoice"],
}
# Names written in Latin script inside local-language prose ("Maximo സിസ്റ്റത്തിൽ")
# must come through unchanged.
LATIN_TERMS = ["Maximo", "CBTC", "SCADA", "CMRS", "MoHUA", "OCC", "ATP", "GSTIN"]
