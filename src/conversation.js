/* Query the local product catalogue; each dashboard owns one in-memory conversation. */
"use strict";
globalThis.createConversation = function createConversation(products, summary) {
  const {money, percent, count, rate, rank, answer} = Analyst;
  const clean = text => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const catalogue = products.map(p => ({p, name:clean(p.name)}));
  const byCode = new Map(products.map(p => [p.sku, p]));
  const positions = ["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth"];
  const countries = /\b(australia|austria|bahrain|belgium|brazil|canada|channel islands|cyprus|czech republic|denmark|eire|ireland|european community|finland|france|germany|greece|hong kong|iceland|israel|italy|japan|lebanon|lithuania|malta|netherlands|norway|poland|portugal|rsa|south africa|saudi arabia|singapore|spain|sweden|switzerland|usa|united states|united arab emirates|united kingdom|uk)\b/;
  const rankings = {
    value: rank(products, "value"),
    rate: rank(products, "rate"),
    sold: rank(products, "sold"), units: rank(products, "units"), largest: rank(products, "largest")
  };
  const title = p => p.name + " (" + p.sku + ")";
  const unitRate = p => p.sold ? percent(rate(p)) : "undefined (zero units sold)";
  const describe = p => title(p) + " — " + money(p.pence) + " cancelled; " +
    count(p.cancelled) + " units credited, " + count(p.sold) + " sold. Unit rate: " + unitRate(p) + ".";
  const formatMetric = {
    value:p => money(p.pence) + " cancelled", rate:p => unitRate(p) + " unit rate",
    sold:p => count(p.sold) + " units sold", units:p => count(p.cancelled) + " units cancelled",
    largest:p => money(p.largestLine) + " largest credit line"
  };
  let focus = null;
  let lastList = [];
  function select(p) {
    focus = p;
    lastList = [];
  }
  return function ask(input) {
    if (typeof input !== "string" || !input.trim() || input.length > 240)
      return "Enter a question of 1–240 characters.";
    const q = clean(input);
    if (/^(help|hello|hi|what can (you|i) (do|ask))$/.test(q))
      return "Try “Top 5 by cancelled units”, “Tell me about cakestand”, or “Compare 22423 and 85123A”. After selecting one product, ask “What is its share of cancelled value?”";
    const codes = [...new Set(q.toUpperCase().match(/\b\d{5}[A-Z]{0,2}\b/g) || [])];
    const missing = codes.find(code => !byCode.has(code));
    if (missing) return "I couldn’t find stock code " + missing + " in the merchandise catalogue.";
    let matches = codes.map(code => byCode.get(code));
    // Match whole descriptions at word boundaries. Longest names win over nested names.
    if (!codes.length) {
      const padded = " " + q + " ";
      const names = catalogue.filter(row => row.name && padded.includes(" " + row.name + " "));
      matches = names.filter(a => !names.some(b => b.name !== a.name && b.name.includes(a.name))).map(row => row.p);
      const lookup = q.match(/^(?:tell me about|find product|search for) (.+)$/);
      if (!matches.length && lookup && lookup[1].length >= 3) {
        const words = lookup[1].split(" ");
        matches = catalogue.filter(row => words.every(word => row.name.split(" ").includes(word))).map(row => row.p);
      }
    }
    const unsupported = /\b(20\d\d|yesterday|today|last month|monthly|weekly|country|countries|france|germany|united kingdom|january|february|march|april|may|june|july|august|september|october|november|december|forecast)\b/;
    // Ignore geographic words inside a matched catalogue description.
    let scope = " " + q + " ";
    for (const p of matches) scope = scope.replace(" " + clean(p.name) + " ", " ");
    if (unsupported.test(scope.replace(/^ may (i|we) /, " ")) || countries.test(scope))
      return "This extract contains full-period product totals. Date, location and forecast breakdowns require additional data.";
    if (/\b(revenue|customers by|sales value|net sales|order count|how many orders)\b/.test(q))
      return "The extract tracks units sold, units credited, credit value and largest credit line. Answering that question requires other measures.";
    if (matches.length > 1) {
      if (matches.length === 2 && /\b(compare|versus|vs|difference|higher|more)\b/.test(q)) {
        lastList = matches;
        focus = null;
        return matches.map(describe).join("\n") + "\nDifference in cancelled value: " + money(Math.abs(matches[0].pence - matches[1].pence)) + ".";
      }
      lastList = matches.slice(0, 6);
      focus = null;
      return "Choose one stock code: " + lastList.map(title).join(", ") + ".";
    }
    const ordinal = q.split(" ").find(word => positions.includes(word));
    if (!matches.length && lastList.length && ordinal && !q.includes("investigate")) {
      const index = positions.indexOf(ordinal);
      if (!lastList[index]) return "That position is outside the previous list.";
      matches = [lastList[index]];
    }
    const referred = /\b(it|its|that product|that item|this sku|this product)\b/.test(q);
    // Short follow-ups inherit the selected SKU unless the user requests store totals.
    if (!matches.length && focus && !/\b(overall|total|store|portfolio)\b/.test(q) &&
        /^(how many (were |units were )?(sold|cancelled|credited)|what about (the )?(rate|value)|and (the )?(rate|value))$/.test(q))
      matches = [focus];
    if (!matches.length && referred) {
      if (!focus) return "Which product do you mean? Enter its stock code.";
      matches = [focus];
    }
    if (matches.length) {
      const p = matches[0];
      select(p);
      if (/\b(why|reason|cause|profit|margin)\b/.test(q))
        return title(p) + ". " + answer(/\b(profit|margin)\b/.test(q) ? "net profit loss" : "why did customers cancel", summary).text;
      if (/\b(share|contribution)\b/.test(q) && /\bunits?\b/.test(q)) {
        const metric = /\bsold\b/.test(q) ? "sold" : "cancelled";
        return title(p) + " represents " + percent(p[metric] / summary.totals[metric]) + " of full-period " +
          metric + " units (" + count(p[metric]) + " of " + count(summary.totals[metric]) + ").";
      }
      if (/\b(share|contribution)\b/.test(q))
        return title(p) + " represents " + percent(p.pence / summary.totals.pence) + " of full-period cancelled value (" + money(p.pence) + " of " + money(summary.totals.pence) + ").";
      if (/\b(largest|biggest|single)\b/.test(q) && /\b(credit|line)\b/.test(q))
        return title(p) + " has a largest credit line of " + money(p.largestLine) + ".";
      return describe(p);
    }
    const top = q.match(/\btop (\d+)\b/);
    if (top) {
      const n = Number(top[1]);
      if (n < 1 || n > 10) return "Choose a list size from 1 to 10.";
      let metric = "value";
      if (/\b(largest|single) credit line\b/.test(q)) metric = "largest";
      else if (/\b(rate|percentage)\b/.test(q)) metric = "rate";
      else if (/\bsold\b/.test(q)) metric = "sold";
      else if (/\bunits\b/.test(q)) metric = "units";
      lastList = rankings[metric].slice(0,n);
      focus = n === 1 ? lastList[0] : null;
      return (metric === "rate" ? "Minimum 100 units sold.\n" : "") + lastList.map((p,i) =>
        (i + 1) + ". " + title(p) + " — " + formatMetric[metric](p)).join("\n");
    }
    if (/\bnet units\b/.test(q)) {
      select(null);
      return "Full-period net units: " + count(summary.totals.sold - summary.totals.cancelled) + " (units sold less units credited).";
    }
    if (/\bhow many products had credits\b/.test(q)) {
      select(null);
      return count(rankings.value.length) + " of " + count(products.length) + " merchandise stock codes had credits.";
    }
    if (/\baverage (credit value|cancelled value) per (credited|cancelled) unit\b/.test(q)) {
      select(null);
      return "Average credit value per credited unit: " + money(summary.totals.pence / summary.totals.cancelled) + " across the full period.";
    }
    if (/\b(overall|store|portfolio|total)\b/.test(q) && /\b(rate|percentage)\b/.test(q)) {
      select(null);
      return "The full-period unit cancellation rate is " + unitRate(summary.totals) + " (" + count(summary.totals.cancelled) + " credited / " + count(summary.totals.sold) + " sold).";
    }
    if (/\b(sku|stock code|tell me about|compare)\b/.test(q) && !/\b(value|rate|rankings|priorities)\b/.test(q))
      return "Enter a stock code or the full product name from the investigation queue.";
    const result = answer(input, summary);
    if (result.intent !== "unknown") {
      const leader = ["value","concentration","action"].includes(result.intent) ? summary.value : null;
      select(result.intent === "rate" ? summary.rate : leader);
    }
    return result.text;
  };
};
