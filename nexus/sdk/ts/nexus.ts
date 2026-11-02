// A TypeScript client for the NEXUS API (P8.md §2.6). No dependencies: fetch, WebCrypto and a
// small JCS (RFC 8785) implementation. Runs in browsers and in Node >= 22.6 (type stripping).
//
//   const alice = new Client("http://127.0.0.1:8765", token);
//   const signer = await Signer.generate();
//   await alice.registerKey(signer);
//   for (const item of await alice.inbox()) {
//     await alice.approve(item.decision_id, item.evidence.proposal, signer); // hashes what it shows
//   }
//
// `approve` never echoes the server's hash: it hashes the proposal it was given, so approving a
// proposal other than the one decided fails with HASH_MISMATCH.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Actor = { kind: string; id: string };

const encoder = new TextEncoder();

/** RFC 8785 canonical JSON. Keys sort by UTF-16 code units; numbers use ECMAScript's shortest
 * round-trip form; strings are escaped as JSON.stringify escapes them. */
export function canonicalize(value: unknown): string {
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
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`JCS cannot represent a ${typeof value}`);
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) throw new TypeError("not lower-case hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

/** sha256 of the canonical proposal: what an approval signs. */
export function proposalHash(proposal: unknown): Promise<string> {
  return sha256Hex(canonicalize(proposal));
}

export function approvalMessage(decisionId: string, proposalHashHex: string, approver: Actor): string {
  return canonicalize({
    v: "nexus.approval/1",
    decision_id: decisionId,
    proposal_hash: proposalHashHex,
    approver: { kind: approver.kind, id: approver.id },
  });
}

/** An Ed25519 key. Generated keys are non-extractable: the private half never leaves WebCrypto. */
export class Signer {
  readonly privateKey: CryptoKey;
  readonly publicKey: string;
  readonly keyId: string;

  constructor(privateKey: CryptoKey, publicKey: string, keyId: string) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.keyId = keyId;
  }

  static async fromKeyPair(pair: CryptoKeyPair): Promise<Signer> {
    const raw = toHex(await crypto.subtle.exportKey("raw", pair.publicKey));
    return new Signer(pair.privateKey, raw, (await sha256Hex(fromHex(raw))).slice(0, 32));
  }

  static async generate(): Promise<Signer> {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
    return Signer.fromKeyPair(pair);
  }

  /** From a PKCS#8 private key and its raw public key, both hex (the test vectors use this). */
  static async fromPkcs8(pkcs8Hex: string, publicKeyHex: string): Promise<Signer> {
    const key = await crypto.subtle.importKey("pkcs8", fromHex(pkcs8Hex), { name: "Ed25519" }, false, ["sign"]);
    return new Signer(key, publicKeyHex, (await sha256Hex(fromHex(publicKeyHex))).slice(0, 32));
  }

  async sign(message: string): Promise<string> {
    return toHex(await crypto.subtle.sign({ name: "Ed25519" }, this.privateKey, encoder.encode(message)));
  }
}

export async function verify(publicKeyHex: string, signatureHex: string, message: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, fromHex(signatureHex), encoder.encode(message));
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, code: string, message: string, body: Record<string, unknown>) {
    super(`${status} ${code}: ${message}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const seg = (value: string): string => encodeURIComponent(value);

export class Client {
  readonly baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError("baseUrl must be http(s)");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
  }

  async request(method: string, path: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.#token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const resp = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
      redirect: "error",
    });
    const text = await resp.text();
    const doc = text ? JSON.parse(text) : null;
    if (!resp.ok) {
      const err = (doc && doc.error) || {};
      throw new ApiError(resp.status, err.code ?? "HTTP_ERROR", err.message ?? "", doc ?? {});
    }
    return doc;
  }

  me(): Promise<{ id: string; kind: string; roles: string[]; keys: unknown[] }> {
    return this.request("GET", "/v1/me");
  }

  async registerKey(signer: Signer): Promise<string> {
    return (await this.request("POST", "/v1/keys", { public_key: signer.publicKey })).key_id;
  }

  async openSession(): Promise<string> {
    return (await this.request("POST", "/v1/sessions")).session_id;
  }

  /** `clarifies`: the answer id of a clarifying question; `text` is the reply to it. */
  send(
    sessionId: string,
    text: string,
    mode: "auto" | "ask" | "act" = "auto",
    cloud = false,
    clarifies?: string,
  ): Promise<any> {
    const body = clarifies === undefined ? { text, mode, cloud } : { text, mode, cloud, clarifies };
    return this.request("POST", `/v1/sessions/${seg(sessionId)}/messages`, body);
  }

  propose(sessionId: string, proposal: Record<string, unknown>): Promise<any> {
    return this.request("POST", `/v1/sessions/${seg(sessionId)}/proposals`, proposal);
  }

  async events(sessionId: string, after = 0): Promise<any[]> {
    return (await this.request("GET", `/v1/sessions/${seg(sessionId)}/events?after=${after | 0}`)).events;
  }

  evidence(decisionId: string): Promise<any> {
    return this.request("GET", `/v1/decisions/${seg(decisionId)}`);
  }

  async execute(decisionId: string): Promise<any> {
    return (await this.request("POST", `/v1/decisions/${seg(decisionId)}/execute`)).execution;
  }

  async inbox(): Promise<any[]> {
    return (await this.request("GET", "/v1/inbox")).items;
  }

  /** Hash the proposal shown, sign that hash, send it. */
  async approve(decisionId: string, proposal: unknown, signer: Signer, approverId?: string): Promise<any> {
    const digest = await proposalHash(proposal);
    const who = { kind: "human", id: approverId ?? (await this.me()).id };
    const signature = await signer.sign(approvalMessage(decisionId, digest, who));
    return this.request("POST", `/v1/decisions/${seg(decisionId)}/approve`, {
      proposal_hash: digest,
      key_id: signer.keyId,
      signature,
    });
  }

  reject(decisionId: string, reason: string): Promise<any> {
    return this.request("POST", `/v1/decisions/${seg(decisionId)}/reject`, { reason });
  }

  /** Rate a given answer up or down; answers rated up become style examples. */
  rate(answerId: string, rating: "up" | "down", note = ""): Promise<any> {
    return this.request("POST", `/v1/answers/${seg(answerId)}/rating`, { rating, note });
  }
}
