"""General-purpose profile: any organisation with the usual desks.

Copy this file to start your own. Matching is lowercase substring, so a stem
("procure", "penalt") covers its inflections. To read documents in Indian
languages as well, list them in LANGUAGES or set DUEPROOF_LANGUAGES.
"""
from dueproof.profiles import english

ORG_NAME = ""
LANGUAGES = []                      # e.g. ["hi", "ta"]; codes from dueproof.languages.py
TIMEZONE = "UTC"
CHANNELS = ["Email", "Shared drive", "Chat", "Scan", "Upload"]

# --- Desks, and the words that route a finding to them ---------------------
ROLES = ["Operations", "Safety & Compliance", "Finance", "Procurement", "Human Resources",
         "Legal", "IT & Security", "Facilities", "Executive Office"]
DEFAULT_ROLE = "Operations"         # where a finding goes when nothing routes it

ROLE_KEYWORDS = {
    "Operations": ["operation", "schedule", "service level", "dispatch", "shift", "downtime"],
    "Safety & Compliance": ["safety", "hazard", "incident", "fire", "evacuat", "compliance",
                            "audit", "inspection", "regulat"],
    "Finance": ["invoice", "payment", "budget", "cost", "tax", "refund", "financ", "$", "€", "£", "₹"],
    "Procurement": ["tender", "vendor", "procure", "purchase order", "quotation", "supplier",
                    "supply"],
    "Human Resources": ["employee", "staff", "leave", "training", "recruit", "payroll",
                        "disciplin"],
    "Legal": ["contract", "clause", "liabilit", "statutory", "penalt", "arbitration", "act,",
              "indemnif"],
    "IT & Security": ["password", "access control", "software", "server", "data breach",
                      "cyber", "backup"],
    "Facilities": ["building", "premises", "hvac", "electrical", "plumbing", "lift",
                   "housekeeping"],
    "Executive Office": ["board", "director", "resolution", "strategy"],
}

# --- Document types --------------------------------------------------------
DEFAULT_DOC_TYPE = "Document"
DOC_TYPE_KEYWORDS = {
    "Policy or circular": ["circular", "policy", "office order", "standard operating procedure"],
    "Regulatory notice": ["regulatory", "statutory directive", "notice of", "regulator"],
    "Invoice": ["invoice no", "tax invoice", "invoice"],
    "Purchase order": ["purchase order", "p.o. no"],
    "Contract": ["agreement", "contract", "hereinafter"],
    "Meeting minutes": ["minutes of the", "board meeting", "resolved that"],
    "Incident report": ["incident report", "near miss", "occurrence report"],
    "Work order": ["work order", "job card", "maintenance schedule"],
    "Legal opinion": ["legal opinion", "arbitration", "writ petition"],
    "Report": ["quarterly report", "annual report", "monitoring report", "findings"],
}

# --- Duties, urgency, deadlines --------------------------------------------
# The shared English lists; extend them here with your organisation's phrasing.
OBLIGATION_CUES = english.OBLIGATION_CUES + []
SEVERITY_HIGH = english.SEVERITY_HIGH + []
DEADLINE_MARKERS = english.DEADLINE_MARKERS + []
INFO_TERMS = english.INFO_TERMS + []
