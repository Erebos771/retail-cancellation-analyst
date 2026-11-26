"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
require("../data/retail.js");
require("../src/analyst.js");
const summary = Analyst.summarize(retailData.products);

// Fixed expectations for the original UCI release; see the independent SQL audit.
const cases = [
  ["Which product warrants investigation first?", "value", ["23843", "£168,469.60"]],
  ["Highest cancellation rate among eligible items?", "rate", ["23843", "100.00%", "80,995"]],
  ["Compare the value and rate rankings", "compare", ["23843", "£168,469.60", "100.00%"]],
  ["Why are customers cancelling their orders?", "cause", ["no cancellation reasons"]],
  ["Total cancelled value in pounds?", "total", ["£478,724.18"]],
  ["Count cancelled units overall", "units", ["272,030"]],
  ["Total units sold across merchandise?", "sold", ["5,576,996"]],
  ["Largest credit line for the leading item?", "concentration", ["£168,469.60", "100.00%"]],
  ["Which records should operations request next?", "action", ["23843", "original invoice"]],
  ["Do we know the profit loss?", "profit", ["unknown", "costs"]]
];
for (const [question, intent, evidence] of cases) {
  test(question, () => {
    const answer = Analyst.answer(question, summary);
    assert.equal(answer.intent, intent);
    for (const fact of evidence) assert.ok(answer.text.includes(fact), fact);
  });
}
test("Unrecognised, markup-only, empty and oversized prompts abstain", () => {
  for (const input of ["Weather in London tomorrow?", "<script>alert(1)</script>", "", "a".repeat(241)]) {
    assert.equal(Analyst.classify(input), "unknown");
  }
});
test("Rate ranks exclude thin denominators; ties use stock code", () => {
  const rows = [
    {sku:"B", sold:100, cancelled:20, pence:10},
    {sku:"A", sold:200, cancelled:40, pence:20},
    {sku:"C", sold:0, cancelled:9, pence:30},
    {sku:"D", sold:99, cancelled:99, pence:40}
  ];
  assert.deepEqual(Analyst.rank(rows, "rate").map(p => p.sku), ["A", "B"]);
  assert.equal(Analyst.rank(rows, "value")[0].sku, "D");
});


require("../src/conversation.js");
const session = () => createConversation(retailData.products, summary);

test("Product questions, comparisons and pronoun follow-ups", () => {
  const ask = session();
  assert.match(ask("Tell me about Regency Cakestand 3 Tier"), /22423.*£9,722.55/);
  assert.match(ask("What is its share?"), /2.03%/);
  assert.match(ask("Compare 22423 and 85123A"), /Difference in cancelled value: £3,098.25/);
  assert.match(ask("What about the second one?"), /85123A.*£6,624.30/);
  assert.match(ask("What was its largest credit line?"), /£4,921.50/);
});
test("Ranked lists support four metrics and positional follow-ups", () => {
  const ask = session();
  for (const metric of ["value", "rate", "units sold", "cancelled units"]) {
    assert.equal(ask("Top 3 by " + metric).split("\n").filter(line => /^\d\./.test(line)).length, 3);
  }
  ask("Top 2 by cancelled value");
  assert.match(ask("Tell me about the second one"), /23166.*£77,479.64/);
});
test("Portfolio rate, ambiguous names and unavailable evidence", () => {
  const ask = session();
  assert.match(ask("Overall cancellation rate?"), /4.88%/);
  assert.match(ask("Tell me about cakestand"), /Choose one stock code/);
  assert.match(ask("Tell me about 99999ZZ"), /find stock code/);
  assert.match(ask("Top 3 in France"), /location/);
  assert.match(ask("Top 3 by revenue"), /other measures/);
});
test("Input bounds and conversational isolation", () => {
  const ask = session();
  ask("22423");
  assert.match(session()("What is its rate?"), /Which product/);
  assert.match(ask("x".repeat(241)), /240/);
  assert.match(ask("Top 200 by value"), /1 to 10/);
});
