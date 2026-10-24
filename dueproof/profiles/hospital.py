"""Example profile: a hospital or health system.

Shows the general pattern for a new domain — desks, the words that route to
them, and the document types that arrive. Duty and deadline phrasing is the
shared English set plus a few clinical-administration terms.
"""
from dueproof.profiles import english

ORG_NAME = "Hospital"
TIMEZONE = "UTC"
CHANNELS = ["Email", "Shared drive", "Fax", "Scan", "Upload"]
LANGUAGES = []

ROLES = ["Medical Administration", "Nursing", "Pharmacy", "Infection Control", "Biomedical",
         "Quality & Accreditation", "Finance & Billing", "Human Resources", "Legal & Compliance",
         "Facilities"]
DEFAULT_ROLE = "Medical Administration"

ROLE_KEYWORDS = {
    "Medical Administration": ["medical superintendent", "clinical", "ward", "admission",
                               "discharge", "duty roster"],
    "Nursing": ["nursing", "nurse", "patient care", "bedside", "handover"],
    "Pharmacy": ["pharmacy", "drug", "medicine", "formulary", "narcotic", "dispens", "expiry"],
    "Infection Control": ["infection", "sterili", "biomedical waste", "hand hygiene", "isolation",
                          "outbreak"],
    "Biomedical": ["equipment", "calibrat", "ventilator", "defibrillator", "preventive maintenance",
                   "biomedical engineer"],
    "Quality & Accreditation": ["accreditation", "audit", "quality indicator", "incident",
                                "sentinel event", "standard operating procedure"],
    "Finance & Billing": ["invoice", "payment", "billing", "tariff", "insurance", "claim",
                          "budget", "$", "€", "£", "₹"],
    "Human Resources": ["employee", "staff", "leave", "training", "recruit", "credential"],
    "Legal & Compliance": ["statutory", "regulat", "licen", "consent", "medico-legal", "penalt",
                           "clause", "act,"],
    "Facilities": ["fire", "electrical", "oxygen plant", "water supply", "lift", "housekeeping"],
}

DEFAULT_DOC_TYPE = "Circular"
DOC_TYPE_KEYWORDS = {
    "Circular": ["circular", "office order", "memorandum"],
    "Regulatory notice": ["regulatory", "inspection notice", "statutory directive", "show cause"],
    "Accreditation report": ["accreditation", "assessment report", "non-conformity"],
    "Incident report": ["incident report", "sentinel event", "near miss", "adverse event"],
    "Equipment record": ["calibration certificate", "service report", "work order", "asset id"],
    "Invoice": ["invoice no", "tax invoice", "invoice"],
    "Purchase order": ["purchase order", "p.o. no"],
    "Policy": ["policy", "standard operating procedure", "protocol"],
    "Meeting minutes": ["minutes of the", "committee meeting", "resolved that"],
}

OBLIGATION_CUES = english.OBLIGATION_CUES + ["calibrate", "sterilise", "sterilize", "renew",
                                             "document in", "notify"]
SEVERITY_HIGH = english.SEVERITY_HIGH + ["patient safety", "sentinel", "life-threatening", "recall"]
DEADLINE_MARKERS = english.DEADLINE_MARKERS + [r"valid until", r"expires? on"]
INFO_TERMS = english.INFO_TERMS + ["patient", "ward", "equipment", "infection"]
