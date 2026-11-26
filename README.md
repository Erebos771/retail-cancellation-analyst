# Ledger · AI-assisted cancellation review

For Gemini mode, install a supported Node.js LTS release (24 or later) and run `powershell -File .\start-gemini.ps1` from the extracted project folder. Enter your Gemini API key at the masked prompt, then visit **http://127.0.0.1:8765**. Ctrl+C stops the backend. The launcher also accepts a preconfigured GEMINI_API_KEY environment variable. GEMINI_MODEL overrides the default gemini-3.1-flash-lite model.

Opening **index.html** directly runs the offline analyst. Keep the data and src folders alongside the page.

## Decision memo for retail operations

**Investigate Paper Craft, Little Birdie (SKU 23843) first.** A single credit line reversed 80,995 units worth £168,469.60. It accounts for 35.19% of the £478,724.18 in qualifying merchandise credits. The item's full-period gross sales also total 80,995 units. Switching the priority metric to cancelled units divided by sold units still places this SKU first, using stock code to break ties.

Ask finance to reconcile that credit with its original order and invoice. Ask fulfilment whether goods were dispatched, and check the customer-service record for the reason. One large reversal warrants a transaction review before a product-wide intervention. Margin, recovery and fulfilment costs are needed to estimate profit impact.

## What the dashboard measures

The full workbook covers 1 December 2010 to 9 December 2011. The extract keeps 536,429 of 541,909 lines, representing 3,805 stock codes. It includes guest purchases. Repeated lines are retained because the source has no unique line identifier.

- The merchandise proxy accepts five digits followed by up to two letters. It excludes 2,995 lines outside this pattern, including many adjustments and fees. This is a reproducible proxy for the catalogue.
- Positive quantities on regular invoices are gross sales. Negative quantities on C-prefixed invoices are credits. We exclude 2,485 further lines with a nonpositive price or inconsistent direction or quantity.
- Cancelled value is absolute credited quantity times line price, rounded to the nearest penny per line. Currency is GBP. Gross units sold total 5,576,996 and credited units total 272,030, giving a portfolio unit rate of 4.88%.
- The rate is a period-level unit ratio. A credit can relate to a sale outside the period. Rankings by rate require at least 100 units sold, an analyst-selected threshold that reduces small-denominator effects. A zero denominator displays a dash. Rankings display the first eight products, with ascending stock code breaking ties.
- Each product uses the lexicographically greatest observed description as a reproducible display label. Stock code determines identity.

## How the AI works

The browser fits a small nearest-neighbour text classifier from labelled examples in **src/analyst.js**. It tokenizes the question, weights rarer words more heavily and measures cosine similarity to examples. The best match for each intent competes against the others. A minimum score and winning margin allow it to abstain.

Ten classifier intents cover portfolio questions. **src/conversation.js** extends these with product lookup, comparisons and ranked lists. The app caches classifier vectors and rankings. Each dashboard session remembers its selected SKU or most recent list in memory. Reloading starts a new session.

Try “Top 3 by cancelled value”, then “Tell me about the second one”, then “What is its share?” Compare two items with “Compare 22423 and 85123A”. Search with “Tell me about cakestand” and choose a stock code if several products match. Ranked lists support 1–10 products by credit value, unit rate, units sold or credited units.

Answers use the full reporting period. This local English-language classifier can misinterpret unfamiliar wording or unsupported filters. Date, country and customer breakdowns require additional data.

## Source and reproducibility

Daqing Chen (2015), [Online Retail](https://doi.org/10.24432/C5BW33), UCI Machine Learning Repository. The source is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The included dataset is a filtered product-level aggregation of the source workbook.

To rebuild, download and extract **Online Retail.xlsx** from UCI. From this project directory, use Python 3.11+ and Node.js 24+ for development. The Windows commands below use an isolated Python environment.

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python src/build_data.py "C:\path\to\Online Retail.xlsx"
.\.venv\Scripts\python tests/audit.py "C:\path\to\Online Retail.xlsx"
node --test tests/*.test.js
```

**src/build_data.py** reads only the necessary fields, validates the official workbook fingerprint, aggregates line items in SQLite and atomically replaces **data/retail.js** after success. **src/view.js** handles rendering and user interaction. **tests/audit.py** independently recomputes reference results with SQL against the original workbook.

## Security measures

- Offline mode runs entirely in the browser. In Gemini mode an explicit question sends the prompt, local analytical evidence, one previous exchange, portfolio totals and five leading product summaries to Google. API usage counts against your Gemini quota. The key stays in the backend process environment. The server writes no conversation logs.
- The backend binds to loopback, validates Host and Origin, serves a fixed set of assets, limits payload size and allows one in-flight Gemini call and ten calls per minute. Gemini failures show a labelled local fallback.
- Only product aggregates ship to the browser. Customer IDs, invoice numbers and individual transaction records are excluded.
- The page's Content Security Policy restricts scripts and styles to local assets, blocks connections in offline mode and allows same-origin connections in Gemini mode. Workbook and model text use text-only DOM APIs.
- Input is limited to 240 characters. Prompts can select only predefined analytical operations. The classifier cannot execute SQL, shell commands or arbitrary JavaScript.
- The build and audit verify the official workbook’s SHA-256 and parse the same open file handle. Both use read-only workbook processing and bound SQL parameters. The Gemini backend parses the generated payload as JSON. The independent audit utility is for the trusted original workbook. Local project files, including the generated JavaScript data asset, must come from a trusted copy.

## Evaluation scorecard

All ten fixed business-question checks passed. These are regression examples for supported behaviour. They do not estimate accuracy on arbitrary questions.

| Question topic | Expected evidence | Result |
|---|---|---|
| Value leader | SKU 23843, £168,469.60 | Pass |
| Eligible rate leader | SKU 23843, 80,995 of 80,995 units | Pass |
| Change of priority metric | Same leader at 100.00% | Pass |
| Customer reasons | Reasons unavailable in source | Pass |
| Aggregate credit value | £478,724.18 | Pass |
| Credited quantity | 272,030 units | Pass |
| Gross quantity sold | 5,576,996 units | Pass |
| Leading credit concentration | £168,469.60 in one line, 100.00% of SKU value | Pass |
| Records to request | Reconcile leading SKU to original invoice | Pass |
| Profit impact | Unknown without cost evidence | Pass |

Six additional tests cover abstention, input length, minimum volume, ties, product lookup, comparisons, ranked lists, context, scope and session isolation. The independent raw-workbook audit checks totals, leaders, concentration and retained row count.

If port 8765 is occupied, set LEDGER_PORT to an available port before launching and open the URL printed by the server.

## Dashboard controls

Rank the investigation queue by cancelled value, unit cancellation rate, cancelled units, units sold or largest credit line. The sales ranking includes products with sales even if they had no credits. The largest-credit ranking uses the largest individual credited line per SKU.

The question-category dropdown groups 18 examples into rankings, sales volume, credit volume, credit value, product comparisons and investigation. Selecting a category displays three questions. Clicking a question runs it using the active offline or Gemini analyst.
