// The approvals inbox (P8.md §2.7). Every value from the server goes in through textContent:
// proposal text can come from documents, so nothing here is parsed as HTML.
import { approvalMessage, encode, fromHex, proposalHash, toHex } from "/inbox/jcs.js";

const $ = (id) => document.getElementById(id);
const TOKEN = "nexus.inbox.token";
let me = null;
let signer = null;

function storedToken() {
  try { return sessionStorage.getItem(TOKEN); } catch { return null; }
}
function storeToken(value) {
  try { value ? sessionStorage.setItem(TOKEN, value) : sessionStorage.removeItem(TOKEN); } catch { /* private mode */ }
}

async function api(method, path, body) {
  const resp = await fetch(path, {
    method,
    headers: Object.assign(
      { Authorization: "Bearer " + storedToken(), Accept: "application/json" },
      body === undefined ? {} : { "Content-Type": "application/json" },
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
    redirect: "error",
  });
  const text = await resp.text();
  const doc = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const err = (doc && doc.error) || {};
    const e = new Error((err.code || resp.status) + ": " + (err.message || ""));
    e.status = resp.status;
    e.code = err.code;
    throw e;
  }
  return doc;
}

function status(text, bad = false) {
  $("status").textContent = text;
  $("status").className = bad ? "warn" : "muted";
}

// ── the signing key: non-extractable, kept in IndexedDB per principal ──

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nexus-inbox", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("keys").objectStore("keys").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSigner() {
  let saved = null;
  try { saved = await idbGet(me.id); } catch { saved = null; }
  const active = new Set(me.keys.filter((k) => !k.revoked).map((k) => k.key_id));
  if (!saved || !active.has(saved.keyId)) {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    const publicKey = toHex(await crypto.subtle.exportKey("raw", pair.publicKey));
    const keyId = await keyIdOf(publicKey);
    await api("POST", "/v1/keys", { public_key: publicKey });
    saved = { privateKey: pair.privateKey, publicKey, keyId };
    try { await idbPut(me.id, saved); } catch { /* key lives for this page only */ }
  }
  signer = saved;
  $("key").textContent = "Signing as " + me.id + " with key " + saved.keyId + " (non-extractable)";
}

async function keyIdOf(publicKeyHex) {
  const digest = await crypto.subtle.digest("SHA-256", fromHex(publicKeyHex));
  return toHex(digest).slice(0, 32);
}

async function sign(message) {
  return toHex(await crypto.subtle.sign({ name: "Ed25519" }, signer.privateKey, encode(message)));
}

// ── rendering ──

function li(text, cls) {
  const el = document.createElement("li");
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

async function renderItem(item) {
  const node = $("item").content.firstElementChild.cloneNode(true);
  const q = (sel) => node.querySelector(sel);
  const { proposal, decision, approvals } = item.evidence;

  q(".action").textContent = proposal.action;
  q(".outcome").textContent = decision.outcome;
  q(".outcome").classList.add("hold");
  q(".chain").textContent = item.intact ? "chain verifies" : "chain broken";
  q(".chain").classList.add(item.intact ? "ok" : "bad");
  q(".params").textContent = JSON.stringify(proposal.params, null, 2);
  q(".rationale").textContent = proposal.rationale || "(none)";
  for (const c of proposal.context || []) {
    const tainted = c.source !== "user" && c.source !== "system";
    const text = c.source + ": " + c.ref + (c.triggered ? " (triggered this)" : "");
    q(".context").append(li(text, tainted ? "tainted" : ""));
  }
  for (const r of decision.reasons || []) q(".reasons").append(li(r.code + ": " + r.message));
  q(".proposer").textContent = proposal.proposer.kind + ":" + proposal.proposer.id;
  const names = approvals.map((a) => a.approver.id + (a.signature ? " (signed)" : " (unsigned)"));
  q(".approvals").textContent =
    approvals.length + " of " + decision.approvals_required + (names.length ? ": " + names.join(", ") : "");

  // The hash this page signs is the one it computes from the proposal it shows.
  const local = await proposalHash(proposal);
  q(".hash-server").textContent = "decided: " + decision.proposal_hash;
  q(".hash-local").textContent = "shown:   " + local;
  const approve = q(".approve");
  const warn = q(".warn");
  const refuse = (text) => { warn.hidden = false; warn.textContent = text; approve.disabled = true; };
  if (local !== decision.proposal_hash) refuse("The proposal shown does not hash to the decided hash. Do not approve.");
  else if (!item.intact) refuse("The event chain does not verify; this evidence cannot be trusted.");
  else if (item.approved_by_you) refuse("You have approved this.");
  else if (item.proposed_by_you) refuse("You proposed this; someone else must approve it.");

  approve.addEventListener("click", async () => {
    approve.disabled = true;
    try {
      const who = { kind: "human", id: me.id };
      const signature = await sign(approvalMessage(item.decision_id, local, who));
      await api("POST", "/v1/decisions/" + encodeURIComponent(item.decision_id) + "/approve", {
        proposal_hash: local, key_id: signer.keyId, signature,
      });
      status("Approved " + item.decision_id + ".");
      await refresh();
    } catch (err) {
      status("Refused: " + err.message, true);
      approve.disabled = false;
    }
  });
  q(".reject").addEventListener("click", async () => {
    const reason = q(".reason").value.trim();
    if (!reason) { status("A rejection needs a reason.", true); return; }
    try {
      await api("POST", "/v1/decisions/" + encodeURIComponent(item.decision_id) + "/reject", { reason });
      status("Rejected " + item.decision_id + ".");
      await refresh();
    } catch (err) {
      status("Refused: " + err.message, true);
    }
  });
  return node;
}

async function refresh() {
  const { items } = await api("GET", "/v1/inbox");
  const nodes = [];
  for (const item of items) nodes.push(await renderItem(item));
  $("items").replaceChildren(...nodes);
  $("empty").hidden = items.length > 0;
}

async function start() {
  if (!storedToken()) {
    $("signin").hidden = false;
    $("main").hidden = true;
    return;
  }
  try {
    me = await api("GET", "/v1/me");
    if (!me.roles.includes("approver") || me.kind !== "human") throw new Error("this principal is not a human approver");
    $("who").textContent = me.id + " (" + me.roles.join(", ") + ")";
    await loadSigner();
    $("signin").hidden = true;
    $("main").hidden = false;
    await refresh();
  } catch (err) {
    storeToken(null);
    $("signin").hidden = false;
    $("main").hidden = true;
    $("who").textContent = "Sign-in failed: " + err.message;
  }
}

$("token-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  storeToken($("token").value.trim());
  $("token").value = "";
  start();
});
$("refresh").addEventListener("click", () => refresh().catch((err) => status(err.message, true)));
$("signout").addEventListener("click", () => {
  storeToken(null);
  me = signer = null;
  $("items").replaceChildren();
  $("who").textContent = "Not signed in.";
  start();
});
start();
