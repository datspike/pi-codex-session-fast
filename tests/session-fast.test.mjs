import test from "node:test";
import assert from "node:assert/strict";
import register, { eligible } from "../extensions/session-fast.ts";

function harness() {
  const events = new Map(), commands = new Map(), statuses = [], notices = [], receipts = [];
  let id = "session-a", idle = true;
  const ctx = { model: { provider: "openai-codex", id: "gpt-6.1-sol" },
    mode: "tui", hasUI: true, isIdle: () => idle,
    sessionManager: { getSessionId: () => id },
    ui: { setStatus: (...args) => statuses.push(args), notify: (...args) => notices.push(args) } };
  register({ on: (key, fn) => events.set(key, fn),
    appendEntry: (type, data) => receipts.push({type, data}),
    registerCommand: (key, cmd) => commands.set(key, cmd) });
  return { ctx, statuses, notices, receipts, setId: value => id = value, setIdle: value => idle = value,
    command: args => commands.get("fast").handler(args, ctx),
    emit: (name, event = {}) => events.get(name)?.(event, ctx),
    request: (payload = { model: ctx.model.id }) => events.get("before_provider_request")({payload}, ctx) };
}

test("off initially, explicit toggle, immutable payload, off", async () => {
  const h = harness(), p = { model: h.ctx.model.id, reasoning: { effort: "high" } };
  assert.equal(h.request(p), undefined);
  await h.command("");
  assert.deepEqual(h.request(p), {...p, service_tier: "priority"});
  assert.equal("service_tier" in p, false);
  await h.command(""); assert.equal(h.request(), undefined);
});
for (const reason of ["new","startup","reload","resume","fork"]) {
  test("session_start resets: " + reason, async () => {
    const h = harness(); await h.command("on");
    h.emit("session_start", {reason}); assert.equal(h.request(), undefined);
    assert.equal(h.statuses.at(-1)[1], undefined);
  });
}
test("unannounced session ID replacement cannot inherit", async () => {
  const h = harness(); await h.command("on"); h.setId("session-b"); assert.equal(h.request(), undefined);
});
test("shutdown and fresh factory cannot inherit", async () => {
  const h = harness(); await h.command("on"); h.emit("session_shutdown");
  assert.equal(h.request(), undefined); assert.equal(harness().request(), undefined);
});
test("only native provider; returning does not re-enable", async () => {
  const h = harness(); await h.command("on");
  h.ctx.model = {...h.ctx.model, provider:"openai"};
  h.emit("model_select", {model:h.ctx.model});
  assert.equal(h.request(), undefined);
  await h.command("on"); assert.equal(h.request(), undefined);
  h.ctx.model.provider = "openai-codex"; assert.equal(h.request(), undefined);
});
test("event model wins before ctx model has changed", async () => {
  const h = harness(); await h.command("on");
  h.emit("model_select", {model:{provider:"openai",id:"gpt-6.1-sol"}});
  assert.equal(h.request(), undefined);
});
test("supported Codex switch retains within same session", async () => {
  const h = harness(); await h.command("on");
  h.ctx.model.id = "gpt-5.6-luna"; h.emit("model_select", {model:h.ctx.model});
  assert.equal(h.request().service_tier, "priority");
});
test("malformed payload and mismatched model unchanged; unknown native model accepted", async () => {
  const h = harness(); await h.command("on");
  for (const p of [null, [], "x", {}, {model:"other"}]) assert.equal(h.request(p), undefined);
  h.ctx.model.id = "future-model"; assert.equal(h.request().service_tier, "priority");
});
test("conflicting tier preserved and disables future injection", async () => {
  const h = harness(); await h.command("on");
  const p = {model:h.ctx.model.id,service_tier:"default"};
  assert.equal(h.request(p), undefined); assert.equal(p.service_tier,"default");
  assert.equal(h.request(), undefined);
});
test("external priority is not owned and warns only once", async () => {
  const h = harness(); await h.command("on");
  const p = {model:h.ctx.model.id,service_tier:"priority"};
  h.request(p); const count=h.notices.length; h.request(p); assert.equal(h.notices.length,count);
  await h.command("off"); assert.equal(h.request(p),undefined); assert.equal(p.service_tier,"priority");
});
test("invalid command and status do not toggle, busy on accepted", async () => {
  const h = harness(); await h.command("wat"); await h.command("status"); assert.equal(h.request(),undefined);
  h.setIdle(false); await h.command("on"); assert.equal(h.request().service_tier,"priority");
  await h.command("wat"); assert.ok(h.request());
  await h.command("status"); assert.ok(h.request());
});
test("turns, tools, retry and compact have no reset handlers", async () => {
  const h = harness(); await h.command("on");
  for(const event of ["agent_end","turn_end","tool_result","session_compact"]) h.emit(event);
  assert.equal(h.request().service_tier,"priority");
});
test("non-UI payload operation remains functional", async () => {
  const h=harness(); h.ctx.mode="json"; h.ctx.hasUI=false;
  await h.command("on"); assert.equal(h.request().service_tier,"priority");
  assert.equal(h.statuses.length,0); assert.equal(h.notices.length,0);
});
test("eligibility bounded to native provider", () => {
  assert.equal(eligible(undefined),false);
  assert.equal(eligible({provider:"openai-codex",id:"gpt-6.1-sol-unknown"}),true);
  assert.equal(eligible({provider:"openai",id:"future-model"}),false);
});
test("review P2 reproduction: unsupported to supported remains off until command", async () => {
  const h = harness(); h.ctx.model.provider = "openai";
  await h.command("on");
  h.emit("model_select", {model:{provider:"openai-codex",id:"gpt-6.1-sol"}});
  assert.equal(h.statuses.at(-1)[1], undefined);
  h.ctx.model.provider = "openai-codex";
  assert.equal(h.request(),undefined);
  await h.command("on");
  assert.equal(h.statuses.at(-1)[1], "⚡ priority requested");
  assert.equal(h.request().service_tier,"priority");
});
test("review P2 reproduction: eligible to eligible has same active indicator", async () => {
  const h=harness(); await h.command("on");
  h.emit("model_select",{model:{provider:"openai-codex",id:"gpt-5.6-luna"}});
  assert.equal(h.statuses.at(-1)[1],"⚡ priority requested");
  h.ctx.model.id="gpt-5.6-luna"; assert.equal(h.request().service_tier,"priority");
});

function frame(h, id, type = "response.created", serverTier = "default", provider = "openai-codex") {
  h.emit("provider_stream_event", {provider, model: h.ctx.model.id, data: {type, response:{id, service_tier:serverTier}}});
}
test("response receipts bind priority and ordinary requests by exact ID", async () => {
  const h=harness(); await h.command("on"); h.request();
  frame(h,"resp-fast"); await h.command("off");
  frame(h,"resp-fast","response.done","default");
  assert.equal(h.receipts.at(-1).data.requestedTier,"priority");
  assert.equal(h.receipts.at(-1).data.serverTier,"default");
  assert.equal(h.receipts.at(-1).data.stage,"response.done");
  h.request(); frame(h,"resp-normal");
  assert.equal(h.receipts.at(-1).data.requestedTier,"default");
  assert.equal(h.receipts.at(-1).data.responseId,"resp-normal");
  assert.equal(h.receipts.at(-1).type,"codex-session-fast-response.v1");
});
test("reset, unbound frames and other providers do not leak receipts", async () => {
  const h=harness(); h.request(); frame(h,"resp-foreign","response.created","priority","openai");
  assert.equal(h.receipts.length,0);
  h.emit("session_start"); frame(h,"resp-old"); assert.equal(h.receipts.length,0);
  h.request(); h.setId("session-b"); frame(h,"resp-wrong-session"); assert.equal(h.receipts.length,0);
});
test("retries replace pending mode and late terminal frames do not bind to another response", async () => {
  const h=harness(); await h.command("on"); h.request(); frame(h,"resp-1");
  await h.command("off"); h.request(); frame(h,"resp-2");
  const count=h.receipts.length; frame(h,"resp-1","response.completed");
  assert.equal(h.receipts.length,count);
  frame(h,"resp-2","response.completed"); assert.equal(h.receipts.at(-1).data.requestedTier,"default");
});
