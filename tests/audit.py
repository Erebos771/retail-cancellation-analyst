"""Independently reproduce dashboard facts in SQLite from the raw UCI workbook."""
import sqlite3
import sys

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from workbook import verified_workbook

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE raw(inv, code, qty, price)")
with verified_workbook(sys.argv[1]) as book:
    rows = iter(book.active.values)
    next(rows)
    db.executemany("INSERT INTO raw VALUES (?,?,?,?)",
                   ((str(r[0]), str(r[1]).upper(), r[3], r[5]) for r in rows))
db.execute("""
CREATE VIEW merchandise AS SELECT * FROM raw
WHERE SUBSTR(code,1,5) GLOB '[0-9][0-9][0-9][0-9][0-9]'
AND (LENGTH(code)=5 OR SUBSTR(code,6) GLOB '[A-Z]' OR SUBSTR(code,6) GLOB '[A-Z][A-Z]')
AND price>0 AND ((inv LIKE 'C%' AND qty<0) OR (inv NOT LIKE 'C%' AND qty>0))
""")
db.execute("""
CREATE VIEW products AS SELECT code,
  SUM(MAX(qty,0)) AS sold, SUM(MAX(-qty,0)) AS credited,
  SUM(ROUND(MAX(-qty,0)*price*100)) AS pennies,
  MAX(ROUND(MAX(-qty,0)*price*100)) AS biggest
FROM merchandise GROUP BY code
""")
assert db.execute("SELECT SUM(sold),SUM(credited),SUM(pennies) FROM products").fetchone() == (
    5576996, 272030, 47872418)
assert db.execute("SELECT code,pennies,biggest FROM products ORDER BY pennies DESC,code LIMIT 1").fetchone() == (
    "23843", 16846960, 16846960)
assert db.execute("""SELECT code,sold,credited FROM products WHERE sold>=100
                     ORDER BY 1.0*credited/sold DESC,code LIMIT 1""").fetchone() == ("23843",80995,80995)
assert db.execute("SELECT COUNT(*) FROM merchandise").fetchone()[0] == 536429
print("Verified totals, both ranking leaders, largest credit line and included row count.")

