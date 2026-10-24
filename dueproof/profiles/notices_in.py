"""Notices and circulars for an Indian business: the default profile.

For the people who open the envelopes — CA and CS firms, in-house compliance,
tax and legal teams. It knows the desks a notice is routed to, the kinds of
notice that arrive (GST, income tax, TDS, MCA/ROC, EPFO/ESIC, RBI/SEBI, courts),
and the offices that issue them. Hindi is read beside English; add your state's
language with DUEPROOF_LANGUAGES=hi,ta (or mr, bn, kn, ...).
"""
from dueproof.profiles import english

ORG_NAME = ""
TIMEZONE = "Asia/Kolkata"
CHANNELS = ["Email", "GST portal", "Income-tax portal", "MCA portal", "Post", "Scan", "Upload"]
LANGUAGES = ["hi"]

# --- Desks -------------------------------------------------------------------
ROLES = ["Direct Tax", "GST & Indirect Tax", "Corporate Secretarial", "Payroll & Labour",
         "Regulatory", "Legal & Litigation", "Finance & Accounts", "Administration"]
DEFAULT_ROLE = "Administration"

ROLE_KEYWORDS = {
    "Direct Tax": ["income-tax", "income tax", "assessing officer", "assessment year", "tds",
                   "tcs", "section 143", "section 142", "section 148", "section 156",
                   "section 245", "section 139", "26as", "pan ", "itr", "faceless"],
    "GST & Indirect Tax": ["gst", "gstin", "cgst", "sgst", "igst", "input tax credit", "itc",
                           "asmt", "drc-0", "e-way bill", "customs", "excise", "service tax",
                           "state tax", "central tax", "rule 86a"],
    "Corporate Secretarial": ["registrar of companies", "roc", "mca", "companies act", "din ",
                              "board resolution", "annual return", "aoc-4", "mgt-7", "dir-3",
                              "company secretary", "llp"],
    "Payroll & Labour": ["provident fund", "epfo", "esic", "esi ", "employees' state insurance",
                         "gratuity", "minimum wages", "shops and establishment", "labour",
                         "factories act", "professional tax", "section 7a", "section 14b"],
    "Regulatory": ["reserve bank", "rbi", "sebi", "irdai", "pfrda", "fema", "kyc", "aml",
                   "circular", "master direction", "listing obligations", "lodr"],
    "Legal & Litigation": ["court", "tribunal", "nclt", "appellate", "writ", "summons",
                           "show cause", "hearing", "affidavit", "advocate", "arbitration",
                           "legal notice", "penalt", "prosecution"],
    "Finance & Accounts": ["payment", "pay the", "demand", "interest", "refund", "challan",
                           "invoice", "outstanding", "₹", "rs.", "lakh", "crore"],
    "Administration": ["office", "address", "premises", "licence", "license", "renewal"],
}

# --- Kinds of notice ---------------------------------------------------------
DEFAULT_DOC_TYPE = "Notice"
DOC_TYPE_KEYWORDS = {
    "GST notice": ["gst asmt", "asmt-10", "drc-01", "drc-01a", "reg-17", "reg-03", "gstin",
                   "goods and services tax", "section 61", "section 73", "section 74"],
    "Income-tax notice": ["income-tax act", "income tax act", "section 143(2)", "section 142(1)",
                          "section 148", "section 148a", "assessment year", "faceless assessment"],
    "Demand notice": ["notice of demand", "section 156", "demand notice", "drc-07"],
    "TDS notice": ["tds", "traces", "short deduction", "section 201"],
    "MCA / ROC notice": ["registrar of companies", "companies act, 2013", "adjudication",
                         "section 454", "ministry of corporate affairs"],
    "EPFO / ESIC notice": ["provident fund", "epfo", "esic", "section 7a", "section 14b"],
    "Regulatory circular": ["master direction", "circular", "notification", "reserve bank of india",
                            "securities and exchange board"],
    "Show-cause notice": ["show cause", "show-cause"],
    "Court or tribunal order": ["in the court of", "high court", "tribunal", "nclt", "order sheet",
                                "next date of hearing", "summons"],
    "Legal notice": ["legal notice", "under instructions from my client", "advocate"],
    "Intimation": ["intimation", "section 143(1)", "section 245", "for your information"],
}

# A notice belongs to a desk as a whole: every finding in a GST notice goes to
# GST, whatever else its sentence mentions.
DOC_TYPE_ROLES = {
    "GST notice": "GST & Indirect Tax", "Income-tax notice": "Direct Tax",
    "Demand notice": "Finance & Accounts", "TDS notice": "Direct Tax",
    "MCA / ROC notice": "Corporate Secretarial", "EPFO / ESIC notice": "Payroll & Labour",
    "Regulatory circular": "Regulatory", "Show-cause notice": "Legal & Litigation",
    "Court or tribunal order": "Legal & Litigation", "Legal notice": "Legal & Litigation",
}

# --- Who issues them ---------------------------------------------------------
AUTHORITIES = [
    "Assistant Commissioner of State Tax", "Deputy Commissioner of State Tax",
    "Assistant Commissioner of Central Tax", "Deputy Commissioner of Central Tax",
    "Superintendent of Central Tax", "State Tax Officer", "Proper Officer",
    "Income Tax Officer", "Assessing Officer", "Deputy Commissioner of Income Tax",
    "Assistant Commissioner of Income Tax", "National Faceless Assessment Centre",
    "Centralized Processing Centre", "TDS Centralized Processing Cell",
    "Registrar of Companies", "Regional Director", "Ministry of Corporate Affairs",
    "Regional Provident Fund Commissioner", "Employees' Provident Fund Organisation",
    "Employees' State Insurance Corporation", "Reserve Bank of India",
    "Securities and Exchange Board of India", "Insurance Regulatory and Development Authority",
    "National Company Law Tribunal", "Income Tax Appellate Tribunal", "High Court",
]
REFERENCE_LABELS = [r"reference\s*(?:no\.?|number|id)", r"ref\.?\s*(?:no\.?)?", r"notice\s*(?:no\.?|number|id)",
                    r"order\s*(?:no\.?|number)", r"DIN", r"ARN", r"document\s*identification\s*number",
                    r"case\s*(?:no\.?|number)", r"file\s*(?:no\.?|number)", r"letter\s*(?:no\.?|number)",
                    r"demand\s*(?:reference|id|no\.?)"]

# --- How duties and urgency are worded ---------------------------------------
OBLIGATION_CUES = english.OBLIGATION_CUES + [
    "furnish", "file the", "deposit", "produce", "submit your reply", "make the payment",
    "remit", "comply with", "appear in person", "attend", "rectify", "reconcile"]
SEVERITY_HIGH = english.SEVERITY_HIGH + [
    "show cause", "penalty", "prosecution", "attachment", "recovery proceedings", "ex parte",
    "best judgment", "cancellation of registration", "blocking", "coercive"]
DEADLINE_MARKERS = english.DEADLINE_MARKERS + [r"latest by", r"positively by", r"till",
                                               r"date of hearing", r"due date"]
INFO_TERMS = english.INFO_TERMS + ["notice", "tax", "demand", "hearing", "section", "penalty",
                                   "reply", "return", "assessment"]
SUBJECT_WORDS = ["subject", "sub", "re", "विषय"]
TITLE_STOPS = ["To", "Ref", "Reference", "Copy to", "प्रति"]
