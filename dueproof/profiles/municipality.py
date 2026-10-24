"""Example profile: a city or district administration.

Shows a public body's desks and paperwork, with two languages switched on —
no own-language vocabulary is written here, so their sentences are read through
translation (see README, "Languages").
"""
from dueproof.profiles import english

ORG_NAME = "Municipal Corporation"
TIMEZONE = "Asia/Kolkata"
CHANNELS = ["Email", "e-Office", "Post", "Scan", "Upload"]
LANGUAGES = ["hi"]                  # add your state's language: "ta", "bn", "mr", ...

ROLES = ["Commissioner's Office", "Engineering & Works", "Water & Sanitation", "Public Health",
         "Town Planning", "Revenue & Tax", "Accounts", "Establishment", "Legal", "Public Grievances"]
DEFAULT_ROLE = "Commissioner's Office"

ROLE_KEYWORDS = {
    "Commissioner's Office": ["commissioner", "council", "resolution", "standing committee"],
    "Engineering & Works": ["road", "bridge", "drain", "street light", "tender", "contractor",
                            "work order", "estimate"],
    "Water & Sanitation": ["water supply", "sewer", "sanitation", "solid waste", "garbage",
                           "treatment plant"],
    "Public Health": ["health", "vaccin", "epidemic", "food safety", "birth", "death", "dengue"],
    "Town Planning": ["building permit", "layout", "zoning", "master plan", "encroach",
                      "occupancy certificate"],
    "Revenue & Tax": ["property tax", "assessment", "arrears", "licence fee", "demand notice",
                      "trade licence"],
    "Accounts": ["invoice", "payment", "budget", "audit", "grant", "utilisation certificate", "₹"],
    "Establishment": ["employee", "staff", "leave", "transfer", "pension", "recruit"],
    "Legal": ["court", "writ", "tribunal", "statutory", "penalt", "act,", "affidavit"],
    "Public Grievances": ["grievance", "complaint", "petition", "right to information", "rti"],
}

DEFAULT_DOC_TYPE = "Government order"
DOC_TYPE_KEYWORDS = {
    "Government order": ["government order", "g.o.", "circular", "office memorandum"],
    "Court order": ["in the high court", "writ petition", "tribunal", "ordered that"],
    "Tender document": ["notice inviting tender", "tender", "bid document"],
    "Work order": ["work order", "agreement no", "measurement book"],
    "Audit report": ["audit report", "audit para", "audit objection"],
    "Council minutes": ["minutes of the", "council meeting", "resolved that"],
    "Grievance": ["grievance", "complaint", "petition"],
    "Invoice": ["invoice no", "tax invoice", "invoice", "bill no"],
    "RTI application": ["right to information", "rti application"],
}

OBLIGATION_CUES = english.OBLIGATION_CUES + ["is directed to", "are directed to", "is requested to",
                                             "action taken report", "reply to", "dispose of"]
SEVERITY_HIGH = english.SEVERITY_HIGH + ["contempt", "court order", "time-bound"]
DEADLINE_MARKERS = english.DEADLINE_MARKERS + [r"within a period of", r"positively by"]
INFO_TERMS = english.INFO_TERMS + ["ward", "tender", "tax", "grievance"]
