"use strict";
const byId = id => document.getElementById(id);
const {products, audit} = retailData;
const summary = Analyst.summarize(products);
const conversation = createConversation(products, summary);
byId("value").textContent = Analyst.money(summary.totals.pence);
byId("units").textContent = Analyst.count(summary.totals.cancelled);
byId("rate").textContent = Analyst.percent(summary.totals.cancelled / summary.totals.sold);
byId("audit").textContent = Analyst.count(audit.included) + " included lines. Excluded " +
  Analyst.count(audit.non_merchandise_code) + " lines outside the stock-code pattern and " +
  Analyst.count(audit.invalid_price_or_direction) + " with invalid price, quantity or direction.";

function renderQueue() {
  const mode = byId("ranking").value;
  const scopes = {rate:"at least 100 units sold", sold:"all products with sales"};
  byId("scope").textContent = "Top 8 · " + (scopes[mode] || "all products with credits");
  byId("metric-heading").textContent = mode === "rate" ? "Cancelled value" : byId("ranking").selectedOptions[0].textContent;
  const body = byId("rows");
  body.replaceChildren();
  for (const product of Analyst.rank(products, mode).slice(0, 8)) {
    const row = body.insertRow();
    const name = row.insertCell();
    // Product descriptions originate in a workbook. Always insert them as text.
    name.textContent = product.name;
    const code = document.createElement("small");
    code.textContent = product.sku;
    name.append(code);
    const values = {units:Analyst.count(product.cancelled), sold:Analyst.count(product.sold),
      largest:Analyst.money(product.largestLine)};
    row.insertCell().textContent = values[mode] || Analyst.money(product.pence);
    row.insertCell().textContent = product.sold ? Analyst.percent(Analyst.rate(product)) : "—";
  }
}
let previous = "";
let pending = false;
async function respond() {
  if (pending) return;
  const question = byId("question").value;
  const localEvidence = conversation(question);
  const output = byId("answer");
  if (document.documentElement.dataset.agent !== "gemini") {
    output.textContent = localEvidence;
    return;
  }
  pending = true;
  const buttons = document.querySelectorAll("aside button, #category");
  buttons.forEach(button => { button.disabled = true; });
  output.textContent = "Asking Gemini…";
  try {
    const response = await fetch("/api/ask", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({question, localEvidence, previous}), signal:AbortSignal.timeout(60000)});
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    output.textContent = result.answer;
    previous = (question + "\n" + result.answer).slice(0,2000);
  } catch (error) {
    output.textContent = error.message + "\n\nLocal analyst: " + localEvidence;
    previous = (question + "\n" + localEvidence).slice(0,2000);
  } finally {
    pending = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}
byId("ranking").addEventListener("change", renderQueue);
byId("ask").addEventListener("submit", event => { event.preventDefault(); respond(); });
const categories = {
  "Rankings":["Top 3 by cancelled value","Top 5 by unit cancellation rate","Top 5 by largest credit line"],
  "Sales volume":["Top 5 by units sold","Total units sold across merchandise?","What are the net units overall?"],
  "Credit volume":["Top 5 by cancelled units","Count cancelled units overall","How many products had credits?"],
  "Credit value":["Total cancelled value in pounds?","Average credit value per credited unit?","What is the largest credit line for 22423?"],
  "Product comparisons":["Compare 22423 and 85123A","What share of cancelled units is SKU 22423?","Tell me about cakestand"],
  "Investigation":["Which product should we investigate first?","Why did customers cancel?","Which records should operations request next?"]
};
const category = byId("category");
for (const name of Object.keys(categories)) category.add(new Option(name, name));
function renderQuestions() {
  byId("suggestions").replaceChildren(...categories[category.value].map(question => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question;
    button.addEventListener("click", () => { byId("question").value = question; respond(); });
    return button;
  }));
}
category.addEventListener("change", renderQuestions);
renderQuestions();
renderQueue();
byId("answer").textContent = conversation(byId("question").value);

