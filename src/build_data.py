"""Build a browser-ready, anonymous summary from the official UCI workbook."""
import argparse
import json
import re
import sqlite3
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from workbook import verified_workbook

ROOT = Path(__file__).resolve().parents[1]
SKU = re.compile(r"[0-9]{5}[A-Z]{0,2}")
SUMMARY = """
SELECT sku, MAX(name), SUM(sold), SUM(cancelled), SUM(pence),
       MAX(CASE WHEN cancelled > 0 THEN pence ELSE 0 END)
FROM lines GROUP BY sku ORDER BY sku
"""


def build(path):
    """Aggregate merchandise only. Store monetary amounts as integer pennies."""
    audit = Counter()
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE lines(sku TEXT, name TEXT, sold INT, cancelled INT, pence INT)")
    try:
        with verified_workbook(path) as book:
            rows = book.active.values
            headers = list(next(rows))
            fields = ["InvoiceNo", "StockCode", "Description", "Quantity", "UnitPrice"]
            indices = [headers.index(field) for field in fields]
            for row in rows:
                invoice, code, name, qty, price = (row[i] for i in indices)
                sku = str(code).strip().upper()
                if not SKU.fullmatch(sku):
                    audit["non_merchandise_code"] += 1
                    continue
                is_credit = str(invoice).upper().startswith("C")
                if not price or price <= 0 or not isinstance(qty, int) or not qty or is_credit != (qty < 0):
                    audit["invalid_price_or_direction"] += 1
                    continue
                quantity = abs(qty)
                value = Decimal(str(price)) * quantity * 100 if is_credit else Decimal(0)
                pennies = int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                db.execute("INSERT INTO lines VALUES (?, ?, ?, ?, ?)",
                           (sku, str(name or sku).strip(), max(qty, 0), max(-qty, 0), pennies))
                audit["included"] += 1
        keys = ["sku", "name", "sold", "cancelled", "pence", "largestLine"]
        products = [dict(zip(keys, row)) for row in db.execute(SUMMARY)]
        return {"audit": dict(audit), "products": products}
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    args = parser.parse_args()
    payload = json.dumps(build(args.workbook), ensure_ascii=True, separators=(",", ":"))
    target = ROOT / "data" / "retail.js"
    temporary = target.with_suffix(".tmp")
    temporary.write_text("globalThis.retailData = " + payload + ";\n", encoding="utf-8")
    temporary.replace(target)

