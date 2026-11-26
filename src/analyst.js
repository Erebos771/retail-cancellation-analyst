/* Local supervised text classification. Only allowlisted handlers can answer. */
"use strict";
globalThis.Analyst = (() => {
  const examples = {
    value: ["which product should we investigate first", "top product by cancelled value", "highest monetary exposure", "which item loses the most money in cancellations"],
    rate: ["which product has the highest cancellation rate", "rank by percentage of units cancelled", "which item has the largest share reversed"],
    compare: ["compare value versus rate priorities", "would the priority change if we switched from value to frequency", "how do both rankings compare"],
    cause: ["why did customers cancel", "what caused the cancellations", "what reasons explain returns"],
    total: ["what is the total cancelled value across all products", "overall value of all cancellations in pounds", "total value in pounds", "total cancelled value", "how much was reversed across the store"],
    units: ["how many units were cancelled overall", "total cancelled units", "quantity reversed across the store"],
    sold: ["how many units were sold overall", "total units sold", "gross sales volume in units"],
    concentration: ["was the leading item driven by one large credit", "largest single cancellation line for the top product", "how concentrated is the top item's exposure"],
    action: ["what evidence should operations collect next", "what records should we request", "next steps for the investigation"],
    profit: ["how much profit did we lose", "can we calculate margin impact", "what is the net profit loss"]
  };
  const stop = new Set("a an the is by in of to for we was did do were how which what has should".split(" "));
  function tokens(text) {
    return [...new Set((text.toLowerCase().match(/[a-z]+/g) || []).filter(t => !stop.has(t)))];
  }
  const samples = Object.entries(examples).flatMap(([intent, phrases]) =>
    phrases.map(phrase => ({intent, words: tokens(phrase)})));
  const weight = new Map();
  for (const {words} of samples) {
    for (const word of words) weight.set(word, (weight.get(word) || 0) + 1);
  }
  function vector(words) {
    return words.map(word => [word, 1 + Math.log((1 + samples.length) / (1 + (weight.get(word) || 0)))]);
  }
  // Training vectors never change during a session.
  const trained = samples.map(({intent, words}) => {
    const features = vector(words);
    return {intent, features, length: Math.hypot(...features.map(pair => pair[1]))};
  });
  function classify(question) {
    if (typeof question !== "string" || question.length > 240) return "unknown";
    const query = new Map(vector(tokens(question)));
    const norm = Math.hypot(...query.values());
    const scores = new Map();
    for (const {intent, features, length} of trained) {
      const dot = features.reduce((sum, [word, w]) => sum + (query.get(word) || 0) * w, 0);
      const score = dot / (norm * length || 1);
      scores.set(intent, Math.max(score, scores.get(intent) || 0));
    }
    const [first, second] = [...scores].sort((a, b) => b[1] - a[1]);
    return first[1] >= 0.34 && first[1] - second[1] >= 0.045 ? first[0] : "unknown";
  }
  const money = p => new Intl.NumberFormat("en-GB", {style:"currency", currency:"GBP"}).format(p / 100);
  const count = n => n.toLocaleString("en-GB");
  const rate = p => p.sold ? p.cancelled / p.sold : null;
  const percent = x => (100 * x).toFixed(2) + "%";
  const label = p => p.name + " (" + p.sku + ")";
  function rank(products, mode) {
    const eligible = products.filter(p => mode === "sold" ? p.sold > 0 :
      p.cancelled > 0 && (mode !== "rate" || p.sold >= 100));
    const metric = {value:p => p.pence, rate, sold:p => p.sold,
      units:p => p.cancelled, largest:p => p.largestLine}[mode];
    return eligible.sort((a, b) => metric(b) - metric(a) || a.sku.localeCompare(b.sku));
  }
  function summarize(products) {
    const totals = {pence:0, sold:0, cancelled:0};
    for (const p of products) {
      for (const field of Object.keys(totals)) totals[field] += p[field];
    }
    return {totals, value:rank(products, "value")[0], rate:rank(products, "rate")[0]};
  }
  function answer(question, summary) {
    const {totals, value: v, rate: r} = summary;
    const intent = classify(question);
    const replies = {
      value: () => label(v) + " leads by cancelled value at " + money(v.pence) + ". Check its largest credit line first.",
      rate: () => label(r) + " leads at " + percent(rate(r)) + " (" + count(r.cancelled) + " cancelled units / " + count(r.sold) + " sold). Minimum 100 units sold.",
      compare: () => "By value, investigate " + label(v) + " at " + money(v.pence) + ". By unit rate, investigate " + label(r) + " at " + percent(rate(r)) + ".",
      total: () => "Included merchandise accounts for " + money(totals.pence) + " in cancelled value.",
      sold: () => "Gross units sold total " + count(totals.sold) + " across included merchandise.",
      units: () => "Credits reversed " + count(totals.cancelled) + " merchandise units.",
      concentration: () => "The largest credit line for " + label(v) + " was " + money(v.largestLine) + ", or " + percent(v.largestLine / v.pence) + " of its cancelled value.",
      cause: () => "The workbook has no cancellation reasons. Match credit notes to original orders and review fulfilment records before assigning a cause.",
      action: () => "Start with " + label(v) + ". Reconcile its largest credit line to the original invoice, dispatch record and customer-service notes.",
      profit: () => "Profit impact is unknown. Estimating it requires costs, margins and recovery or resale information.",
      unknown: () => "I couldn’t match that question confidently. Ask about the full-period value leader, unit rate, total volume, credit concentration or investigation evidence."
    };
    return {intent, text: replies[intent]()};
  }
  return {answer, classify, summarize, rank, money, count, rate, percent};
})();

