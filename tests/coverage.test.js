"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../data/retail");
require("../src/analyst");
require("../src/conversation");
const {products} = retailData;
const ask = () => createConversation(products, Analyst.summarize(products));

test("Ordinals follow the last displayed list, including position ten", () => {
  const query = ask();
  const last = query("Top 10 by value").split("\n").at(-1).match(/\((\w+)\)/)[1];
  assert.ok(query("Tell me about the tenth one").includes("(" + last + ")"));
  query("Top 3 by value");
  query("Find product cakestand");
  assert.match(query("Tell me about the second one"), /22776/);
});
test("Unit and monetary shares use their own denominators", () => {
  const query = ask();
  assert.match(query("What share of cancelled units is SKU 22423?"), /0.32%.*857 of 272,030/);
  assert.match(query("What is its share of units sold?"), /0.25%.*13,879 of 5,576,996/);
  assert.match(query("What is its share of cancelled value?"), /2.03%/);
});
test("Geographic qualifiers and ambiguous month wording", () => {
  const query = ask();
  for (const country of ["Spain","UK","Australia","USA","Ireland","Channel Islands"])
    assert.match(query("Top 3 by cancelled value in " + country), /location/);
  assert.match(query("May I see the top 3 by value?"), /23843/);
  assert.match(query("Top 3 in May"), /Date/);
});
test("All product aggregates reconcile and largest credit never exceeds SKU exposure", () => {
  assert.equal(new Set(products.map(p=>p.sku)).size,3805);
  for (const p of products) {
    for (const field of ["sold","cancelled","pence","largestLine"])
      assert.ok(Number.isSafeInteger(p[field]) && p[field]>=0, p.sku);
    assert.ok(p.largestLine<=p.pence,p.sku);
  }
  assert.equal(products.reduce((s,p)=>s+p.pence,0),47872418);
});

test("Additional ranking metrics and portfolio questions match the catalogue", () => {
  const query = ask();
  for (const [mode, field] of [["units","cancelled"],["sold","sold"],["largest","largestLine"]]) {
    const expected = products.filter(p => p[field] > 0)
      .sort((a,b) => b[field] - a[field] || a.sku.localeCompare(b.sku)).slice(0,8);
    assert.deepEqual(Analyst.rank(products,mode).slice(0,8),expected);
  }
  assert.match(query("How many products had credits?"), /1,938 of 3,805/);
  assert.match(query("Average credit value per credited unit?"), /£1.76/);
  assert.match(query("What are the net units overall?"), /5,304,966/);
  assert.match(query("Top 5 by largest credit line"), /largest credit line/);
});
