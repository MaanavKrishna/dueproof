"""English phrasing shared by every profile: how a duty, a deadline and urgency
are worded. Profiles import these lists and add their own to them."""

# A sentence containing any of these directs someone to do something.
OBLIGATION_CUES = [
    "shall", "must", "is required", "are required", "required to", "responsible for",
    "submit", "furnish", "ensure", "complete", "comply", "report to", "certify",
    "carry out", "undertake", "deploy", "rectify", "close out", "action taken",
    "not later than", "on or before", "by the", "deadline", "compliance report"]

SEVERITY_HIGH = ["immediate", "immediately", "mandatory", "statutory", "penalt",
                 "safety-critical", "suspend", "shall not", "non-compliance", "urgent"]

# Regex fragments. A date is only a *deadline* when the sentence frames it as
# one; without this, issue dates and reporting periods get filed as obligations.
DEADLINE_MARKERS = [r"on or before", r"not later than", r"no later than", r"\bby\b", r"\bbefore\b",
                    r"within", r"due (?:on|by|date)", r"deadline", r"target completion",
                    r"last date"]

INFO_TERMS = ["report", "compliance", "inspect", "safety", "maintenance"]
