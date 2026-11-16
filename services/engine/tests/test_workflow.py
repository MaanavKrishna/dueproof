"""The obligation workflow: status, assignee, corrected dates and desks, notes —
the original finding never overwritten, every change in the history."""
import csv
import io
import unittest

from dueproof import db
from tests.support import client, make_pdf, upload, wait_done


def fresh_obligation(marker: str) -> dict:
    """A new document with one dated obligation, and that obligation."""
    got = upload(make_pdf(f"workflow-{marker}")).json()
    wait_done(got["doc_id"])
    card = client().get(f"/api/document/{got['doc_id']}").json()
    ob, = [o for o in card["obligations"] if o["due_date"]]
    return ob


def patch(finding_id: str, **body):
    return client().patch(f"/api/findings/{finding_id}", json=body)


def line(**params) -> list[dict]:
    return client().get("/api/deadlines", params={"limit": 2000, **params}).json()


class Status(unittest.TestCase):
    def test_done_leaves_the_open_line_and_can_come_back(self):
        ob = fresh_obligation("done")
        self.assertIn(ob["id"], [i["id"] for i in line()])
        self.assertEqual(patch(ob["id"], status="done").json()["status"], "done")
        self.assertNotIn(ob["id"], [i["id"] for i in line()])
        self.assertIn(ob["id"], [i["id"] for i in line(status="done")])
        self.assertIn(ob["id"], [i["id"] for i in line(status="all")])
        card = client().get(f"/api/document/{ob['doc_id']}").json()
        self.assertEqual(card["obligations"][0]["status"], "done")
        queue = {d["id"]: d for d in client().get("/api/documents", params={"limit": 500}).json()}
        self.assertEqual(queue[ob["doc_id"]]["deadline_count"], 0)       # nothing left open
        patch(ob["id"], status="open")
        self.assertIn(ob["id"], [i["id"] for i in line()])

    def test_a_done_item_is_never_shown_as_overdue(self):
        ob = fresh_obligation("overdue")
        patch(ob["id"], due_date="2001-01-01", status="done")
        item, = [i for i in line(status="done") if i["id"] == ob["id"]]
        self.assertLess(item["days_left"], 0)
        self.assertFalse(item["overdue"])

    def test_bad_values_are_refused(self):
        ob = fresh_obligation("bad")
        for body in ({"status": "finished"}, {"due_date": "31/12/2026"}, {"due_date": "2026-02-30"},
                     {"roles": []}, {"roles": ["No such desk"]}, {"note": "x" * 2001}):
            with self.subTest(body=body):
                self.assertEqual(patch(ob["id"], **body).status_code, 422)
        self.assertEqual(patch("no-such-finding", status="done").status_code, 404)
        self.assertEqual(client().get("/api/deadlines", params={"status": "nope"}).status_code, 422)


class Corrections(unittest.TestCase):
    def test_a_corrected_date_moves_the_item_and_keeps_the_original(self):
        ob = fresh_obligation("date")
        self.assertEqual(ob["due_date"], "2026-08-21")
        got = patch(ob["id"], due_date="2026-12-31").json()
        self.assertEqual((got["due_date"], got["found_due_date"], got["edited"]),
                         ("2026-12-31", "2026-08-21", True))
        dates = [i["due_date"] for i in line()]
        self.assertEqual(dates, sorted(dates))                           # ordered by the correction
        self.assertIn("2026-12-31", dates)
        restored = patch(ob["id"], due_date=None).json()
        self.assertEqual(restored["due_date"], "2026-08-21")
        self.assertEqual(db.one("SELECT due_date FROM findings WHERE id=?", (ob["id"],))["due_date"],
                         "2026-08-21")                                   # never overwritten

    def test_corrected_desks_route_the_item_everywhere(self):
        ob = fresh_obligation("desks")
        self.assertNotIn("Finance", ob["roles"])
        got = patch(ob["id"], roles=["Finance"]).json()
        self.assertEqual((got["roles"], got["found_roles"]), (["Finance"], ob["roles"]))
        self.assertIn(ob["id"], [i["id"] for i in line(role="Finance")])
        self.assertNotIn(ob["id"], [i["id"] for i in line(role="Safety Officer")])
        finance = [d["id"] for d in client().get("/api/documents",
                                                 params={"role": "Finance", "limit": 500}).json()]
        self.assertIn(ob["doc_id"], finance)
        self.assertEqual(patch(ob["id"], roles=None).json()["roles"], ob["roles"])

    def test_an_undated_duty_can_be_given_a_date(self):
        got = upload(make_pdf("undated") + b"").json()
        wait_done(got["doc_id"])
        db.run("UPDATE findings SET due_date=NULL WHERE doc_id=? AND kind='obligation'", (got["doc_id"],))
        ob = client().get(f"/api/document/{got['doc_id']}").json()["obligations"][0]
        self.assertNotIn(ob["id"], [i["id"] for i in line()])
        patch(ob["id"], due_date="2026-11-30")
        self.assertIn(ob["id"], [i["id"] for i in line()])

    def test_assignee_and_note(self):
        ob = fresh_obligation("assign")
        got = patch(ob["id"], assignee="  asha@example.org ", note="Reply drafted; awaiting CFO").json()
        self.assertEqual((got["assignee"], got["note"]), ("asha@example.org", "Reply drafted; awaiting CFO"))
        self.assertEqual(patch(ob["id"], assignee="", note="").json()["assignee"], None)


class History(unittest.TestCase):
    def test_every_change_is_recorded_once(self):
        ob = fresh_obligation("history")
        patch(ob["id"], status="done", assignee="ravi@example.org")
        patch(ob["id"], status="done")                                   # no change, no entry
        patch(ob["id"], due_date="2027-01-15")
        h = client().get(f"/api/findings/{ob['id']}/history").json()
        self.assertEqual([(e["field"], e["old"], e["new"]) for e in h],
                         [("status", "open", "done"), ("assignee", None, "ravi@example.org"),
                          ("due_override", None, "2027-01-15")])
        self.assertTrue(all(e["actor"] == "testclient" for e in h))
        audit = db.q("SELECT detail FROM audit WHERE action='edit_finding' AND doc_id=?", (ob["doc_id"],))
        self.assertEqual(len(audit), 2)
        self.assertEqual(client().get("/api/findings/nope/history").status_code, 404)


class Exports(unittest.TestCase):
    def test_the_spreadsheet_carries_state_and_assignee(self):
        ob = fresh_obligation("export")
        patch(ob["id"], assignee="meera@example.org")
        r = client().get("/api/export/deadlines.csv", params={"status": "all"})
        rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
        mine = [x for x in rows if x["Assignee"] == "meera@example.org"]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["State"], "open")


if __name__ == "__main__":
    unittest.main()
