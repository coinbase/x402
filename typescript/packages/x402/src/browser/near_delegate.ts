/**
 * Browser-side NEP-366 builder for SignedDelegateAction (zero deps).
 * Uses wallet.signMessage(...) to sign the Borsh-encoded DelegateAction bytes.
 *
 * Works with wallets that implement NEP-413-style `signMessage({ message, recipient, nonce })`
 * and return a raw 64B ed25519 signature (Uint8Array | base64 | "ed25519:<base58>").
 *
 * If your wallet supports secp256k1 keys, see the NOTE at the bottom.
 */

export type NearNetwork = "near-mainnet" | "near-testnet";

export interface NearWalletLike {
  signMessage(input: {
    message: Uint8Array; // bytes to sign (DelegateAction Borsh bytes)
    recipient: string; // facilitator/relayer account (for wallet UX)
    nonce: Uint8Array; // 32 bytes (server-issued in production)
    callbackUrl?: string;
  }): Promise<{
    accountId: string;
    publicKey: string; // "ed25519:<base58>" or "secp256k1:<hex/b58>" (wallet-dependent)
    signature: Uint8Array | string;
  }>;
}

/* ---------- Public API ---------- */

/**
 * Builds a signed delegate action using a NEAR wallet for signing
 *
 * @param opts - Configuration options
 * @param opts.wallet - The NEAR wallet instance to use for signing
 * @param opts.recipientForWallet - The facilitator account ID shown in wallet UX
 * @param opts.nonce32 - A 32-byte nonce (server-issued in production)
 * @param opts.delegate - Delegate action parameters
 * @param opts.delegate.sender_id - The user's account ID
 * @param opts.delegate.ft_contract - The token contract ID (receiver at tx layer)
 * @param opts.delegate.receiver_id_in_args - The merchant/payTo account in ft_transfer args
 * @param opts.delegate.amount_base_units - The token amount in base units as string
 * @param opts.delegate.memo - Optional memo for the transfer
 * @param opts.delegate.nonce - A unique nonce as u64 bigint
 * @param opts.delegate.max_block_height - Maximum block height as u64 bigint
 * @param opts.delegate.pubkey32 - Optional 32-byte public key if already known
 * @returns Object with base64-encoded signed delegate action, account ID, and public key
 */
export async function buildSignedDelegateActionB64WithWallet(opts: {
  wallet: NearWalletLike;
  recipientForWallet: string; // facilitator account (wallet UX)
  nonce32: Uint8Array; // 32B, server-issued in prod
  delegate: {
    sender_id: string; // user account
    ft_contract: string; // token contract (receiver_id at tx layer)
    receiver_id_in_args: string; // payTo merchant
    amount_base_units: string; // token base units string
    memo?: string | null;
    nonce: bigint; // u64
    max_block_height: bigint; // u64
    pubkey32?: Uint8Array; // optional: if you already know it
  };
}): Promise<{ sda_b64: string; accountId: string; publicKey: string }> {
  const d = buildDelegateActionExact({
    sender_id: opts.delegate.sender_id,
    ft_contract: opts.delegate.ft_contract,
    pubkey32: opts.delegate.pubkey32 ?? new Uint8Array(32), // filled after sign if wallet exposes pk separately
    nonce: opts.delegate.nonce,
    max_block_height: opts.delegate.max_block_height,
    receiver_id_in_args: opts.delegate.receiver_id_in_args,
    amount: opts.delegate.amount_base_units,
    memo: opts.delegate.memo ?? null,
  });

  // If we don't know the raw 32B pk yet, sign with placeholder, then replace with actual pk and re-sign:
  let msg = encodeDelegateAction(d);

  const res = await opts.wallet.signMessage({
    message: msg,
    recipient: opts.recipientForWallet,
    nonce: opts.nonce32,
  });

  // Normalize public key (ed25519 only for v1)
  const pkInfo = parseNearPublicKey(res.publicKey);
  if (pkInfo.keyType !== 0) {
    throw new Error("Only ed25519 keys supported in v1 (secp256k1 planned)");
  }
  // If we had a placeholder pk, rebuild DelegateAction with the real pk and re-sign for correctness:
  if (!opts.delegate.pubkey32 || !equalBytes(d.public_key.data, pkInfo.raw32)) {
    d.public_key = { keyType: 0, data: pkInfo.raw32 };
    msg = encodeDelegateAction(d);
    const again = await opts.wallet.signMessage({
      message: msg,
      recipient: opts.recipientForWallet,
      nonce: opts.nonce32,
    });
    const sigBytes = normalizeSigBytes(again.signature);
    const sda = encodeSignedDelegateActionB64({
      delegate_action: d,
      signature: { keyType: 0, data: sigBytes },
    });
    return { sda_b64: sda, accountId: again.accountId, publicKey: again.publicKey };
  }

  const sigBytes = normalizeSigBytes(res.signature);
  const sda = encodeSignedDelegateActionB64({
    delegate_action: d,
    signature: { keyType: 0, data: sigBytes },
  });
  return { sda_b64: sda, accountId: res.accountId, publicKey: res.publicKey };
}

/* ---------- Minimal Borsh encoders (mirror of facilitator) ---------- */

type PublicKey = { keyType: number; data: Uint8Array };
type Signature = { keyType: number; data: Uint8Array };
type Action = {
  kind: "FunctionCall";
  data: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint };
};

type DelegateAction = {
  sender_id: string;
  receiver_id: string;
  actions: Action[];
  nonce: bigint;
  max_block_height: bigint;
  public_key: PublicKey;
};

type SignedDelegateAction = { delegate_action: DelegateAction; signature: Signature };

const ACTION_TAGS = { FunctionCall: 2 } as const;

/**
 * Borsh writer for encoding data structures
 */
class Writer {
  chunks: Uint8Array[] = [];
  /**
   * Writes a u8 value
   *
   * @param v - The u8 value to write
   */
  u8(v: number) {
    this.chunks.push(U8(v));
  }
  /**
   * Writes a u32 value
   *
   * @param v - The u32 value to write
   */
  u32(v: number) {
    this.chunks.push(U32(v));
  }
  /**
   * Writes a u64 value
   *
   * @param v - The u64 value to write
   */
  u64(v: bigint) {
    this.chunks.push(U64(v));
  }
  /**
   * Writes a u128 value
   *
   * @param v - The u128 value to write
   */
  u128(v: bigint) {
    this.chunks.push(U128(v));
  }
  /**
   * Writes raw bytes
   *
   * @param b - The bytes to write
   */
  bytes(b: Uint8Array) {
    this.chunks.push(b);
  }
  /**
   * Writes a string (length-prefixed UTF-8)
   *
   * @param s - The string to write
   */
  str(s: string) {
    const b = enc(s);
    this.u32(b.length);
    this.bytes(b);
  }
  /**
   * Writes a vector (length-prefixed array)
   *
   * @param arr - The array to write
   * @param f - Function to encode each element
   */
  vec<T>(arr: T[], f: (w: Writer, x: T) => void) {
    this.u32(arr.length);
    for (const x of arr) f(this, x);
  }
  /**
   * Finishes writing and returns the encoded bytes
   *
   * @returns The encoded bytes
   */
  finish(): Uint8Array {
    let len = 0;
    for (const c of this.chunks) len += c.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}
const enc = (s: string) => new TextEncoder().encode(s);
const U8 = (v: number) => Uint8Array.of(v & 0xff);
const U32 = (v: number) =>
  new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
const U64 = (v: bigint) => {
  const b = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
};
const U128 = (v: bigint) => {
  const b = new Uint8Array(16);
  let x = v;
  for (let i = 0; i < 16; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
};

/**
 * Encodes an action to Borsh bytes
 *
 * @param a - The action to encode
 * @returns The encoded bytes
 */
function encodeAction(a: Action): Uint8Array {
  const w = new Writer();
  w.u8(ACTION_TAGS.FunctionCall);
  w.str(a.data.methodName);
  w.u32(a.data.args.length);
  w.bytes(a.data.args);
  w.u64(a.data.gas);
  w.u128(a.data.deposit);
  return w.finish();
}

/**
 * Encodes a public key to Borsh bytes
 *
 * @param pk - The public key to encode
 * @returns The encoded bytes
 */
function encodePublicKey(pk: PublicKey): Uint8Array {
  if (pk.keyType !== 0) throw new Error("ed25519 only");
  if (pk.data.length !== 32) throw new Error("pk 32B");
  const w = new Writer();
  w.u8(0);
  w.bytes(pk.data);
  return w.finish();
}
/**
 * Encodes a signature to Borsh bytes
 *
 * @param sig - The signature to encode
 * @returns The encoded bytes
 */
function encodeSignature(sig: Signature): Uint8Array {
  if (sig.keyType !== 0) throw new Error("ed25519 only");
  if (sig.data.length !== 64) throw new Error("sig 64B");
  const w = new Writer();
  w.u8(0);
  w.bytes(sig.data);
  return w.finish();
}

/**
 * Encodes a delegate action to Borsh bytes
 *
 * @param d - The delegate action to encode
 * @returns The encoded bytes
 */
function encodeDelegateAction(d: DelegateAction): Uint8Array {
  const w = new Writer();
  w.str(d.sender_id);
  w.str(d.receiver_id);
  w.vec(d.actions, (w2, act) => w2.bytes(encodeAction(act)));
  w.u64(d.nonce);
  w.u64(d.max_block_height);
  w.bytes(encodePublicKey(d.public_key));
  return w.finish();
}

/**
 * Encodes a signed delegate action to Borsh bytes
 *
 * @param sda - The signed delegate action to encode
 * @returns The encoded bytes
 */
function encodeSignedDelegateAction(sda: SignedDelegateAction): Uint8Array {
  const w = new Writer();
  w.bytes(encodeDelegateAction(sda.delegate_action));
  w.bytes(encodeSignature(sda.signature));
  return w.finish();
}

/**
 * Encodes a signed delegate action to base64 string
 *
 * @param sda - The signed delegate action to encode
 * @returns The base64-encoded string
 */
function encodeSignedDelegateActionB64(sda: SignedDelegateAction): string {
  return toB64(encodeSignedDelegateAction(sda));
}
/**
 * Converts bytes to base64 string
 *
 * @param u8 - The bytes to encode
 * @returns The base64-encoded string
 */
function toB64(u8: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  // @ts-expect-error btoa is available in browser environment
  return btoa(s);
}

/* ---------- helpers ---------- */

/**
 * Builds a FunctionCall action for ft_transfer
 *
 * @param args - Transfer arguments
 * @param args.receiver_id - The account to receive tokens
 * @param args.amount - The amount to transfer as a string
 * @param args.memo - Optional memo for the transfer
 * @returns The FunctionCall action
 */
function buildFtTransferAction(args: {
  receiver_id: string;
  amount: string;
  memo?: string | null;
}): Action {
  const gas = 30_000_000_000_000n; // 30 Tgas
  const deposit = 1n; // 1 yocto (required)
  const body: { receiver_id: string; amount: string; memo?: string } = {
    receiver_id: args.receiver_id,
    amount: args.amount,
  };
  if (args.memo != null) body.memo = args.memo;
  const json = enc(JSON.stringify(body));
  return { kind: "FunctionCall", data: { methodName: "ft_transfer", args: json, gas, deposit } };
}

/**
 * Builds a delegate action for exact FT transfer
 *
 * @param p - Delegate action parameters
 * @param p.sender_id - The sender account ID
 * @param p.ft_contract - The FT contract ID (receiver at tx layer)
 * @param p.pubkey32 - The 32-byte public key
 * @param p.nonce - The nonce as u64 bigint
 * @param p.max_block_height - The maximum block height as u64 bigint
 * @param p.receiver_id_in_args - The receiver in ft_transfer args (merchant/payTo)
 * @param p.amount - The token amount as a string
 * @param p.memo - Optional memo for the transfer
 * @returns The delegate action
 */
function buildDelegateActionExact(p: {
  sender_id: string;
  ft_contract: string;
  pubkey32: Uint8Array;
  nonce: bigint;
  max_block_height: bigint;
  receiver_id_in_args: string;
  amount: string;
  memo?: string | null;
}): DelegateAction {
  return {
    sender_id: p.sender_id,
    receiver_id: p.ft_contract,
    actions: [
      buildFtTransferAction({
        receiver_id: p.receiver_id_in_args,
        amount: p.amount,
        memo: p.memo ?? null,
      }),
    ],
    nonce: p.nonce,
    max_block_height: p.max_block_height,
    public_key: { keyType: 0, data: p.pubkey32 },
  };
}

/**
 * Normalizes signature from various formats to Uint8Array
 *
 * @param sig - The signature in Uint8Array, base64, or "ed25519:base58" format
 * @returns The signature as Uint8Array
 */
function normalizeSigBytes(sig: Uint8Array | string): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (typeof sig !== "string") throw new Error("invalid signature type");
  if (sig.startsWith("ed25519:")) return bs58decode(sig.slice(8));
  // assume base64
  return fromB64(sig);
}
/**
 * Converts base64 string to Uint8Array
 *
 * @param b64 - The base64 string to decode
 * @returns The decoded bytes
 */
function fromB64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  // @ts-expect-error atob is available in browser environment
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/**
 * Decodes a base58 string to Uint8Array
 *
 * @param s - The base58 string to decode
 * @returns The decoded bytes
 */
function bs58decode(s: string): Uint8Array {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const M: Record<string, number> = {};
  for (let i = 0; i < A.length; i++) M[A[i]] = i;
  let n = 0n;
  for (const c of s) {
    const v = M[c];
    if (v === undefined) throw new Error("bad base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n % 256n));
    n /= 256n;
  }
  bytes.reverse();
  let lead = 0;
  for (const c of s) {
    if (c === "1") lead++;
    else break;
  }
  const out = new Uint8Array(lead + bytes.length);
  out.set(bytes, lead);
  return out;
}
/**
 * Parses a NEAR public key string to extract key type and raw bytes
 *
 * @param pk - The public key string (e.g., "ed25519:base58" or "secp256k1:hex/base58")
 * @returns Object with keyType (0=ed25519, 1=secp256k1) and raw 32 bytes
 */
function parseNearPublicKey(pk: string): { keyType: 0 | 1; raw32: Uint8Array } {
  const [kind, body] = pk.split(":");
  if (kind === "ed25519") return { keyType: 0, raw32: bs58decode(body) };
  if (kind === "secp256k1") return { keyType: 1, raw32: hexOrB58(body) }; // Placeholder handling (v1 rejects later)
  throw new Error("Unsupported publicKey format");
}
/**
 * Decodes a hex or base58 string to Uint8Array
 *
 * @param s - The hex or base58 string to decode
 * @returns The decoded bytes
 */
function hexOrB58(s: string): Uint8Array {
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
    return out;
  }
  return bs58decode(s);
}
/**
 * Checks if two Uint8Arrays are equal
 *
 * @param a - First byte array
 * @param b - Second byte array
 * @returns True if arrays are equal, false otherwise
 */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* NOTE on secp256k1:
 * NEAR supports secp256k1 keys, but signature format & digesting rules differ from ed25519.
 * This builder locks to ed25519 in v1 for safety (keyType==0). You can extend it after confirming:
 *  - signature length/format (64/65 bytes), and
 *  - whether wallets sign raw bytes or a digest (e.g., sha256(msg)).
 */
