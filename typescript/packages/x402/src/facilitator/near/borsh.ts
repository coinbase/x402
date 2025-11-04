/* NEAR NEP-366 Borsh decoder + encoder (zero deps)
 *
 * Decodes/Encodes SignedDelegateAction -> DelegateAction -> Vec<Action>
 * Supports the Action variants we need for x402 `exact`:
 *   - FunctionCall(method_name, args(bytes), gas(u64), deposit(u128))
 *   - Transfer(deposit(u128))  // not used in v1 exact, but handy
 *
 * IMPORTANT: Variant tags come from nearcore. These are the widely-used values:
 *   2 => FunctionCall
 *   3 => Transfer
 * If your nearcore / @near-js version differs, update ACTION_TAGS accordingly.
 *
 * Little-endian for integers (borsh). Strings are length-prefixed u32 + UTF-8 bytes.
 */

export type NearNetwork = "near-mainnet" | "near-testnet";

/* ---------- data types ---------- */

export interface PublicKey {
  keyType: number; // 0 => ED25519
  data: Uint8Array; // 32 bytes
}

export interface Signature {
  keyType: number; // 0 => ED25519
  data: Uint8Array; // 64 bytes
}

export interface FunctionCallAction {
  methodName: string;
  args: Uint8Array;
  gas: bigint; // u64
  deposit: bigint; // u128
}

export interface TransferAction {
  deposit: bigint; // u128
}

export type Action =
  | { kind: "FunctionCall"; data: FunctionCallAction }
  | { kind: "Transfer"; data: TransferAction }
  | { kind: "Unsupported"; tag: number };

export interface DelegateAction {
  sender_id: string;
  receiver_id: string;
  actions: Action[];
  nonce: bigint; // u64
  max_block_height: bigint; // u64
  public_key: PublicKey;
}

export interface SignedDelegateAction {
  delegate_action: DelegateAction;
  signature: Signature;
}

/* ---------- constants (confirm against your nearcore/tooling) ---------- */

const ACTION_TAGS = {
  FunctionCall: 2,
  Transfer: 3,
  // Other variants exist; we reject/mark Unsupported by default
} as const;

/* ===========================
 * DECODERS
 * =========================== */

/**
 * Borsh reader for decoding data structures
 */
class Reader {
  private o = 0;
  /**
   * Creates a new Borsh reader
   *
   * @param b - The bytes to read from
   */
  constructor(private b: Uint8Array) {}

  /**
   * Checks if at end of file
   *
   * @returns True if at EOF, false otherwise
   */
  eof() {
    return this.o >= this.b.length;
  }
  /**
   * Reads a u8 value
   *
   * @returns The u8 value
   */
  u8(): number {
    const v = this.b[this.o];
    this.o += 1;
    return v;
  }
  /**
   * Reads a u32 value
   *
   * @returns The u32 value
   */
  u32(): number {
    const v =
      this.b[this.o] |
      (this.b[this.o + 1] << 8) |
      (this.b[this.o + 2] << 16) |
      (this.b[this.o + 3] << 24);
    this.o += 4;
    return v >>> 0;
  }
  /**
   * Reads a u64 value
   *
   * @returns The u64 value as bigint
   */
  u64(): bigint {
    // little-endian 8 bytes
    let lo = 0n,
      hi = 0n;
    for (let i = 0; i < 4; i++) lo |= BigInt(this.b[this.o + i]) << (8n * BigInt(i));
    for (let i = 0; i < 4; i++) hi |= BigInt(this.b[this.o + 4 + i]) << (8n * BigInt(i));
    this.o += 8;
    return (hi << 32n) | lo;
  }
  /**
   * Reads a u128 value
   *
   * @returns The u128 value as bigint
   */
  u128(): bigint {
    // little-endian 16 bytes
    let v = 0n;
    for (let i = 0; i < 16; i++) v |= BigInt(this.b[this.o + i]) << (8n * BigInt(i));
    this.o += 16;
    return v;
  }
  /**
   * Reads n bytes
   *
   * @param n - Number of bytes to read
   * @returns The bytes read
   */
  bytes(n: number): Uint8Array {
    const s = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return s;
  }
  /**
   * Reads a vector (length-prefixed array)
   *
   * @param fn - Function to decode each element
   * @returns The decoded array
   */
  vec<T>(fn: () => T): T[] {
    const len = this.u32();
    const out: T[] = [];
    for (let i = 0; i < len; i++) out.push(fn());
    return out;
  }
  /**
   * Reads a string (length-prefixed UTF-8)
   *
   * @returns The decoded string
   */
  str(): string {
    const len = this.u32();
    const s = this.bytes(len);
    return new TextDecoder().decode(s);
  }
}

/**
 * Decodes a public key from Borsh bytes
 *
 * @param r - The reader to decode from
 * @returns The decoded public key
 */
function decodePublicKey(r: Reader): PublicKey {
  const keyType = r.u8(); // 0 = ED25519
  const data = r.bytes(32);
  return { keyType, data };
}

/**
 * Decodes a signature from Borsh bytes
 *
 * @param r - The reader to decode from
 * @returns The decoded signature
 */
function decodeSignature(r: Reader): Signature {
  const keyType = r.u8(); // 0 = ED25519
  const data = r.bytes(64);
  return { keyType, data };
}

/**
 * Decodes an action from Borsh bytes
 *
 * @param r - The reader to decode from
 * @returns The decoded action
 */
function decodeAction(r: Reader): Action {
  const tag = r.u8();
  if (tag === ACTION_TAGS.FunctionCall) {
    const methodName = r.str();
    const argsLen = r.u32();
    const args = r.bytes(argsLen);
    const gas = r.u64();
    const deposit = r.u128();
    return { kind: "FunctionCall", data: { methodName, args, gas, deposit } };
  }
  if (tag === ACTION_TAGS.Transfer) {
    const deposit = r.u128();
    return { kind: "Transfer", data: { deposit } };
  }
  // Unknown/unsupported
  return { kind: "Unsupported", tag };
}

/**
 * Decodes a delegate action from Borsh bytes
 *
 * @param r - The reader to decode from
 * @returns The decoded delegate action
 */
function decodeDelegateAction(r: Reader): DelegateAction {
  const sender_id = r.str();
  const receiver_id = r.str();
  const actions = r.vec<Action>(() => decodeAction(r));
  const nonce = r.u64();
  const max_block_height = r.u64();
  const public_key = decodePublicKey(r);
  return { sender_id, receiver_id, actions, nonce, max_block_height, public_key };
}

/**
 * Decodes a base64-encoded (standard base64) SignedDelegateAction bytes
 *
 * @param b64 - The base64-encoded signed delegate action
 * @returns The decoded signed delegate action
 */
export function decodeSignedDelegateActionB64(b64: string): SignedDelegateAction {
  const bytes = fromBase64(b64);
  const r = new Reader(bytes);
  const delegate_action = decodeDelegateAction(r);
  const signature = decodeSignature(r);
  if (!r.eof()) {
    // Allow trailing zeros? Typically shouldn't be present.
    // Ignore or throw — choose throw to surface malformed payloads.
    throw new Error("Trailing bytes after SignedDelegateAction");
  }
  return { delegate_action, signature };
}

/* ===========================
 * ENCODERS (for fixtures/tests)
 * =========================== */

/**
 * Borsh writer for encoding data structures
 */
class Writer {
  private chunks: Uint8Array[] = [];
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
    const b = utf8(s);
    this.u32(b.length);
    this.bytes(b);
  }
  /**
   * Writes a vector (length-prefixed array)
   *
   * @param arr - The array to write
   * @param enc - Function to encode each element
   */
  vec<T>(arr: T[], enc: (w: Writer, t: T) => void) {
    this.u32(arr.length);
    for (const x of arr) enc(this, x);
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

/* ---- scalar encoders ---- */

/**
 * Encodes a u8 value to bytes
 *
 * @param v - The u8 value to encode
 * @returns The encoded bytes
 */
function U8(v: number): Uint8Array {
  return Uint8Array.of(v & 0xff);
}

/**
 * Encodes a u32 value to bytes
 *
 * @param v - The u32 value to encode
 * @returns The encoded bytes
 */
function U32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = v & 0xff;
  b[1] = (v >>> 8) & 0xff;
  b[2] = (v >>> 16) & 0xff;
  b[3] = (v >>> 24) & 0xff;
  return b;
}

/**
 * Encodes a u64 value to bytes
 *
 * @param v - The u64 value to encode
 * @returns The encoded bytes
 */
function U64(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

/**
 * Encodes a u128 value to bytes
 *
 * @param v - The u128 value to encode
 * @returns The encoded bytes
 */
function U128(v: bigint): Uint8Array {
  const b = new Uint8Array(16);
  let x = v;
  for (let i = 0; i < 16; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

/**
 * Encodes a string to UTF-8 bytes
 *
 * @param s - The string to encode
 * @returns The UTF-8 encoded bytes
 */
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/* ---- public encoders ---- */

/**
 * Encodes a public key to Borsh bytes
 *
 * @param pk - The public key to encode
 * @returns The encoded bytes
 */
export function encodePublicKey(pk: PublicKey): Uint8Array {
  if (pk.keyType !== 0) throw new Error("Only ED25519 (keyType=0) supported");
  if (pk.data.length !== 32) throw new Error("PublicKey.data must be 32 bytes");
  const w = new Writer();
  w.u8(pk.keyType);
  w.bytes(pk.data);
  return w.finish();
}

/**
 * Encodes a signature to Borsh bytes
 *
 * @param sig - The signature to encode
 * @returns The encoded bytes
 */
export function encodeSignature(sig: Signature): Uint8Array {
  if (sig.keyType !== 0) throw new Error("Only ED25519 (keyType=0) supported");
  if (sig.data.length !== 64) throw new Error("Signature.data must be 64 bytes");
  const w = new Writer();
  w.u8(sig.keyType);
  w.bytes(sig.data);
  return w.finish();
}

/**
 * Encodes an action to Borsh bytes
 *
 * @param a - The action to encode
 * @returns The encoded bytes
 */
export function encodeAction(a: Action): Uint8Array {
  const w = new Writer();
  if (a.kind === "FunctionCall") {
    w.u8(ACTION_TAGS.FunctionCall);
    w.str(a.data.methodName);
    w.u32(a.data.args.length);
    w.bytes(a.data.args);
    w.u64(a.data.gas);
    w.u128(a.data.deposit);
  } else if (a.kind === "Transfer") {
    w.u8(ACTION_TAGS.Transfer);
    w.u128(a.data.deposit);
  } else {
    throw new Error(`Unsupported action tag for encoder: ${"tag" in a ? a.tag : a.kind}`);
  }
  return w.finish();
}

/**
 * Encodes a delegate action to Borsh bytes
 *
 * @param d - The delegate action to encode
 * @returns The encoded bytes
 */
export function encodeDelegateAction(d: DelegateAction): Uint8Array {
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
export function encodeSignedDelegateAction(sda: SignedDelegateAction): Uint8Array {
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
export function encodeSignedDelegateActionB64(sda: SignedDelegateAction): string {
  return toBase64(encodeSignedDelegateAction(sda));
}

/* ---- small helpers for fixture building ---- */

/**
 * Build FunctionCall("ft_transfer", {receiver_id, amount, memo?}, gas, deposit)
 *
 * @param args - FT transfer arguments
 * @param args.receiver_id - The account to receive tokens
 * @param args.amount - The amount to transfer as a string
 * @param args.memo - Optional memo for the transfer
 * @param args.gasTgas - Gas amount in Tgas (default 30)
 * @param args.depositYocto - Deposit amount in yoctoNEAR (default 1)
 * @returns The FunctionCall action for ft_transfer
 */
export function buildFtTransferAction(args: {
  receiver_id: string;
  amount: string;
  memo?: string | null;
  gasTgas?: number;
  depositYocto?: bigint;
}): Action {
  const gas = BigInt((args.gasTgas ?? 30) * 1_000_000_000_000); // default 30 Tgas
  const deposit = args.depositYocto ?? 1n; // 1 yocto NEAR required
  const body: { receiver_id: string; amount: string; memo?: string } = {
    receiver_id: args.receiver_id,
    amount: args.amount,
  };
  if (args.memo != null) body.memo = args.memo;
  const json = utf8(JSON.stringify(body)); // note: JSON key order as written
  return {
    kind: "FunctionCall",
    data: {
      methodName: "ft_transfer",
      args: json,
      gas,
      deposit,
    },
  };
}

/**
 * Convenience to assemble DelegateAction for exact-FT transfer (without signature)
 *
 * @param params - Delegate action parameters
 * @param params.sender_id - The sender account ID
 * @param params.ft_contract - The FT contract ID (receiver at tx layer)
 * @param params.pubkey32 - The raw 32-byte ed25519 public key
 * @param params.nonce - The nonce as u64 bigint
 * @param params.max_block_height - The maximum block height as u64 bigint
 * @param params.receiver_id_in_args - The merchant/payTo account in ft_transfer args
 * @param params.amount - The token amount in base units as a string
 * @param params.memo - Optional memo for the transfer
 * @returns The delegate action for exact FT transfer
 */
export function buildDelegateActionExact(params: {
  sender_id: string;
  ft_contract: string; // receiver_id at the tx layer
  pubkey32: Uint8Array; // raw 32-byte ed25519 pubkey
  nonce: bigint;
  max_block_height: bigint;
  receiver_id_in_args: string; // merchant/payTo in ft_transfer args
  amount: string; // token base units
  memo?: string | null;
}): DelegateAction {
  return {
    sender_id: params.sender_id,
    receiver_id: params.ft_contract,
    actions: [
      buildFtTransferAction({
        receiver_id: params.receiver_id_in_args,
        amount: params.amount,
        memo: params.memo ?? null,
      }),
    ],
    nonce: params.nonce,
    max_block_height: params.max_block_height,
    public_key: { keyType: 0, data: params.pubkey32 },
  };
}

/* ---------- helpers ---------- */

/**
 * Decodes a base64 string to bytes
 *
 * @param b64 - The base64 string to decode
 * @returns The decoded bytes
 */
export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  // Browser fallback
  // @ts-expect-error atob is available in browser environment
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* toBase64 is symmetrical with fromBase64 above */
/**
 * Encodes bytes to base64 string
 *
 * @param u8 - The bytes to encode
 * @returns The base64-encoded string
 */
export function toBase64(u8: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  // @ts-expect-error btoa is available in browser environment
  return btoa(s);
}

/* Pretty-printer for debugging */
/**
 * Creates a pretty-printed representation of a signed delegate action for debugging
 *
 * @param sda - The signed delegate action to format
 * @returns A human-readable object representation
 */
export function prettySDA(sda: SignedDelegateAction) {
  const { delegate_action: d } = sda;
  const act = d.actions[0];
  return {
    sender: d.sender_id,
    receiver: d.receiver_id,
    actions: d.actions.map(a => a.kind),
    nonce: d.nonce.toString(),
    max_block_height: d.max_block_height.toString(),
    functionCall:
      act?.kind === "FunctionCall"
        ? {
            methodName: act.data.methodName,
            gas: act.data.gas.toString(),
            deposit: act.data.deposit.toString(),
            argsLen: act.data.args.length,
          }
        : null,
  };
}
