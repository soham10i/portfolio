// End to end: the TypeScript SDK approves a held decision on a running server. Started by
// tests/test_api_db.py with the server's URL, an approver's token and the decision in the
// environment. Exit 0 when the server accepted the TS-signed approval and refused a TS-signed
// approval of a modified proposal.
import { ApiError, Client, Signer } from "../nexus.ts";

const env = process.env;
const alice = new Client(env.NEXUS_E2E_URL!, env.NEXUS_E2E_TOKEN!);
const signer = await Signer.generate();
await alice.registerKey(signer);
const [item] = (await alice.inbox()).filter((i: any) => i.decision_id === env.NEXUS_E2E_DECISION);
if (!item) throw new Error("the decision is not in the inbox");

const shown = item.evidence.proposal;
const modified = { ...shown, params: { ...shown.params, text: shown.params.text + "!" } };
try {
  await alice.approve(item.decision_id, modified, signer);
  throw new Error("a modified proposal was approved");
} catch (err) {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== "HASH_MISMATCH") throw err;
}
const ok = await alice.approve(item.decision_id, shown, signer);
console.log(JSON.stringify({ approved: ok.approval.decision_id, key_id: ok.approval.signature.key_id }));
