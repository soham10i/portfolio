// The TypeScript SDK and the inbox's JCS against sdk/vectors.json, which Python generates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as inbox from "../../../src/nexus/api/static/jcs.js";
import { approvalMessage, canonicalize, proposalHash, Signer, verify } from "../nexus.ts";

const vectors = JSON.parse(readFileSync(new URL("../../vectors.json", import.meta.url), "utf8"));

test("canonical JSON matches Python, in the SDK and in the inbox", () => {
  for (const { value, json } of vectors.canonical) {
    assert.equal(canonicalize(value), json);
    assert.equal(inbox.canonicalize(value), json);
  }
});

test("proposal hashes match Python, and a modified proposal hashes differently", async () => {
  const [original, modified] = vectors.proposal_hash;
  for (const { proposal, hash } of vectors.proposal_hash) {
    assert.equal(await proposalHash(proposal), hash);
    assert.equal(await inbox.proposalHash(proposal), hash);
  }
  assert.notEqual(original.hash, modified.hash);
});

test("the approval message and its signature match Python", async () => {
  const a = vectors.approval;
  assert.equal(approvalMessage(a.decision_id, a.proposal_hash, a.approver), a.message);
  assert.equal(inbox.approvalMessage(a.decision_id, a.proposal_hash, a.approver), a.message);
  const signer = await Signer.fromPkcs8(a.key.pkcs8_hex, a.key.public_key);
  assert.equal(signer.keyId, a.key.key_id);
  assert.equal(await signer.sign(a.message), a.signature); // Ed25519 is deterministic
  assert.ok(await verify(a.key.public_key, a.signature, a.message));
  assert.ok(!(await verify(a.key.public_key, a.signature, a.message.replace("alice", "mallory"))));
});

test("a generated key is non-extractable and verifies its own signatures", async () => {
  const signer = await Signer.generate();
  assert.equal(signer.privateKey.extractable, false);
  assert.match(signer.publicKey, /^[0-9a-f]{64}$/);
  assert.match(signer.keyId, /^[0-9a-f]{32}$/);
  const sig = await signer.sign("hello");
  assert.ok(await verify(signer.publicKey, sig, "hello"));
});

test("JCS refuses what it cannot represent", () => {
  assert.throws(() => canonicalize(Number.NaN));
  assert.throws(() => canonicalize(2 ** 60));
  assert.throws(() => canonicalize(undefined));
});
