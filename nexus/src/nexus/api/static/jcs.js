// RFC 8785 canonical JSON, sha256 and the approval message, for the inbox. The same rules as
// nexus.store.canonical_json and nexus.signing; sdk/ts/test/vectors.test.ts checks this file
// against the vectors Python generates.

const encoder = new TextEncoder();

export function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS cannot represent NaN or Infinity");
    // Beyond 2^53 an integer printed as digits may not be the integer Python meant (Python
    // refuses those too); from 1e21 up the value prints in exponent form, plainly a double.
    if (Number.isInteger(value) && !Number.isSafeInteger(value) && Math.abs(value) < 1e21) {
      throw new TypeError("JCS cannot represent integers beyond 2^53 - 1 exactly");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  throw new TypeError("JCS cannot represent a " + typeof value);
}

export function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export function proposalHash(proposal) {
  return sha256Hex(canonicalize(proposal));
}

export function approvalMessage(decisionId, proposalHashHex, approver) {
  return canonicalize({
    v: "nexus.approval/1",
    decision_id: decisionId,
    proposal_hash: proposalHashHex,
    approver: { kind: approver.kind, id: approver.id },
  });
}

export function encode(text) {
  return encoder.encode(text);
}
