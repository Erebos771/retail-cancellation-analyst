"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {createServer} = require("../server");

test("Local API enforces origin and handles Gemini responses", async t => {
  let status = 200;
  let calls = 0;
  const server = createServer("test-only", "test-model", async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, "generativelanguage.googleapis.com");
    assert.equal(options.headers["x-goog-api-key"], "test-only");
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Verified example."}]}}]}), {status});
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  t.after(() => server.close());
  function post(origin) {
    return new Promise((resolve,reject) => {
      const req = http.request({hostname:"127.0.0.1",port:server.address().port,path:"/api/ask",method:"POST",
        headers:{Host:"127.0.0.1:8765",Origin:origin,"Content-Type":"application/json"}}, async res => {
        let body = "";
        for await (const chunk of res) body += chunk;
        resolve({status:res.statusCode, data:JSON.parse(body)});
      });
      req.on("error",reject);
      req.end(JSON.stringify({question:"What is the leading item?",previous:"",localEvidence:""}));
    });
  }
  assert.equal((await post("https://example.org")).status,403);
  assert.equal(calls,0);
  const origin = "http://127.0.0.1:8765";
  assert.equal((await post(origin)).data.answer,"Verified example.");
  for (status of [401,404,429]) assert.match((await post(origin)).data.error,new RegExp(String(status)));
});

test("Dashboard routes, validation, upstream failures and request limits", async t => {
  let calls = 0;
  let reply = async () => new Response(JSON.stringify({candidates:[]}));
  const server = createServer("test-only","fixture", async (_, options) => {
    calls++;
    const facts = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.equal(facts.totals.pence,47872418);
    return reply();
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  t.after(() => server.close());
  function send(method, path, body, headers = {}) {
    return new Promise((resolve,reject) => {
      const req = http.request({hostname:"127.0.0.1",port:server.address().port,method,path,
        headers:{Host:"127.0.0.1:8765",Origin:"http://127.0.0.1:8765","Content-Type":"application/json",...headers}},async res=>{
        let text = "";
        for await (const chunk of res) text += chunk;
        resolve({status:res.statusCode,text,headers:res.headers});
      });
      req.on("error",reject);
      req.end(body);
    });
  }
  const page = await send("GET","/");
  assert.equal(page.status,200);
  assert.match(page.text,/data-agent="gemini"/);
  assert.equal(page.headers["cache-control"],"no-store");
  assert.equal(page.headers["x-frame-options"],"DENY");
  for (const asset of ["src/style.css","src/analyst.js","src/conversation.js","src/view.js","data/retail.js"])
    assert.equal((await send("GET","/"+asset)).status,200);
  assert.equal((await send("GET","/server.js")).status,404);
  assert.equal((await send("GET","/",undefined,{Host:"localhost"})).status,403);
  const data = {question:"Which SKU leads?",localEvidence:"",previous:""};
  const post = (body, headers) => send("POST","/api/ask",body,headers);
  for (const body of ["{","null","{}",JSON.stringify({...data,question:" "}),JSON.stringify({...data,question:"x".repeat(241)}),JSON.stringify({...data,previous:"x".repeat(2001)}),JSON.stringify({...data,localEvidence:"x".repeat(13000)})])
    assert.equal((await post(body)).status,400);
  assert.equal((await post(JSON.stringify(data),{"Content-Type":"text/plain"})).status,403);
  assert.equal(calls,0);
  const body = JSON.stringify({...data,totals:{}});
  assert.match((await post(body)).text,/returned no text/);
  reply = () => { throw Error("unavailable"); };
  assert.match((await post(body)).text,/failed or timed out/);
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  reply = () => new Promise(resolve => {
    release = () => resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:"OK"}]}}]})));
    started();
  });
  const pending = post(body);
  await ready;
  assert.equal((await post(body)).status,429);
  release();
  assert.equal((await pending).status,200);
  reply = () => new Response(JSON.stringify({candidates:[{content:{parts:[{text:"OK"}]}}]}));
  for (let i=calls; i<10; i++) assert.equal((await post(body)).status,200);
  assert.equal((await post(body)).status,429);
  assert.equal(calls,10);
});
