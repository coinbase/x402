/**
 * Unit tests for @x402/kaspa — using vitest.
 *
 * Run: npx vitest run test/test.ts
 */

import { describe, it, expect } from "vitest";
import { isCovenantAsset, validateAsset } from "../../src/constants";
import { selectUtxos } from "../../src/exact/client/scheme";
import { ExactKaspaScheme as ClientScheme } from "../../src/exact/client/scheme";
import { ExactKaspaScheme as FacilitatorScheme } from "../../src/exact/facilitator/scheme";
import { ExactKaspaScheme as ServerScheme } from "../../src/exact/server/scheme";
import {
  addressToScriptPublicKey,
  decodeBech32Payload,
  bigIntToNumberReplacer,
} from "../../src/utils";

// ── Utils: bech32 decode + addressToScriptPublicKey ───────────────

describe("decodeBech32Payload", () => {
  // Known test vector: Address for privkey b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef
  // xOnlyPublicKey = dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659
  // Address: kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva
  const payload = "qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva";

  it("decodes version and pubkey correctly", () => {
    const { version, data } = decodeBech32Payload(payload);
    expect(version).toBe(0); // P2PK
    expect(data.length).toBe(32); // x-only pubkey
    const hex = Array.from(data)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe("dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659");
  });

  it("throws on invalid bech32 character", () => {
    expect(() => decodeBech32Payload("1bcd")).toThrow(/Invalid bech32 character/);
  });
});

describe("addressToScriptPublicKey", () => {
  const knownAddr = "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva";
  const knownPubkey = "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659";

  it("converts P2PK address to correct script", () => {
    const result = addressToScriptPublicKey(knownAddr);
    expect(result.version).toBe(0);
    // P2PK: 20 + xOnlyPubKey + ac
    expect(result.script).toBe("20" + knownPubkey + "ac");
  });

  it("throws on address without prefix", () => {
    expect(() => addressToScriptPublicKey("qr0lr4ml9fn3chek")).toThrow(/missing prefix/);
  });
});

describe("bigIntToNumberReplacer", () => {
  it("converts BigInt to Number", () => {
    const obj = { a: 100n, b: "hello", c: 42 };
    const json = JSON.stringify(obj, bigIntToNumberReplacer);
    expect(json).toBe('{"a":100,"b":"hello","c":42}');
  });

  it("handles nested BigInt", () => {
    const obj = { outer: { inner: 999n } };
    const json = JSON.stringify(obj, bigIntToNumberReplacer);
    expect(json).toBe('{"outer":{"inner":999}}');
  });
});

// ── UTXO Selection ─────────────────────────────────────────────────

describe("selectUtxos", () => {
  const mkUtxo = (amount: number) => ({
    transactionId: "aa".repeat(32),
    index: 0,
    amount: BigInt(amount),
    scriptPublicKey: { version: 0, script: "20" + "bb".repeat(32) + "ac" },
    blockDaaScore: 0n,
    isCoinbase: false,
  });

  it("selects single UTXO when sufficient", () => {
    const utxos = [mkUtxo(100_000_000)];
    const { selected, totalInput } = selectUtxos(utxos, 50_000_000n);
    expect(selected.length).toBe(1);
    expect(totalInput).toBe(100_000_000n);
  });

  it("selects multiple UTXOs to cover amount", () => {
    const utxos = [mkUtxo(30_000_000), mkUtxo(40_000_000), mkUtxo(50_000_000)];
    const { selected, totalInput } = selectUtxos(utxos, 80_000_000n);
    // Largest-first: 50M + 40M = 90M >= 80M
    expect(selected.length).toBe(2);
    expect(totalInput).toBe(90_000_000n);
  });

  it("selects all UTXOs when total barely covers", () => {
    const utxos = [mkUtxo(10_000_000), mkUtxo(20_000_000), mkUtxo(30_000_000)];
    const { selected, totalInput } = selectUtxos(utxos, 60_000_000n);
    expect(selected.length).toBe(3);
    expect(totalInput).toBe(60_000_000n);
  });

  it("returns insufficient total without error", () => {
    const utxos = [mkUtxo(10_000_000)];
    const { selected, totalInput } = selectUtxos(utxos, 50_000_000n);
    expect(selected.length).toBe(1);
    expect(totalInput).toBe(10_000_000n);
    expect(totalInput < 50_000_000n).toBeTruthy();
  });

  it("handles empty UTXO set", () => {
    const { selected, totalInput } = selectUtxos([], 100n);
    expect(selected.length).toBe(0);
    expect(totalInput).toBe(0n);
  });

  it("sorts largest-first", () => {
    const utxos = [mkUtxo(10), mkUtxo(50), mkUtxo(30)];
    const { selected } = selectUtxos(utxos, 40n);
    expect(selected[0].amount).toBe(50n);
  });
});

// ── Server Scheme: Price Parsing ───────────────────────────────────

describe("ServerScheme.parsePrice", () => {
  const server = new ServerScheme();

  it("parses number as KAS", async () => {
    const result = await server.parsePrice(1.5, "kaspa:mainnet");
    expect(result.asset).toBe("native");
    expect(result.amount).toBe("150000000");
  });

  it("parses string as KAS", async () => {
    const result = await server.parsePrice("0.5", "kaspa:mainnet");
    expect(result.asset).toBe("native");
    expect(result.amount).toBe("50000000");
  });

  it("parses AssetAmount (sompi)", async () => {
    const result = await server.parsePrice(
      { asset: "native", amount: "123456789" },
      "kaspa:mainnet",
    );
    expect(result.amount).toBe("123456789");
  });

  it("rejects unsupported asset", async () => {
    await expect(() =>
      server.parsePrice({ asset: "USDC", amount: "100" }, "kaspa:mainnet"),
    ).rejects.toThrow(/Invalid asset/);
  });

  it("rejects negative price", async () => {
    await expect(() => server.parsePrice(-1, "kaspa:mainnet")).rejects.toThrow(/Invalid price/);
  });

  it("rejects zero price", async () => {
    await expect(() => server.parsePrice(0, "kaspa:mainnet")).rejects.toThrow(/Invalid price/);
  });

  it("handles small KAS amounts", async () => {
    const result = await server.parsePrice(0.00000001, "kaspa:mainnet");
    expect(result.amount).toBe("1");
  });
});

// ── Server Scheme: enhancePaymentRequirements ──────────────────────

describe("ServerScheme.enhancePaymentRequirements", () => {
  const server = new ServerScheme();

  it("returns requirements unchanged", async () => {
    const req = {
      scheme: "exact",
      network: "kaspa:mainnet",
      asset: "native",
      amount: "100000000",
      payTo: "kaspa:qr0lr4ml...",
      maxTimeoutSeconds: 30,
      extra: {},
    };
    const result = await server.enhancePaymentRequirements(
      req,
      { x402Version: 1, scheme: "exact", network: "kaspa:mainnet" },
      [],
    );
    expect(result).toEqual(req);
  });
});

// ── Client Scheme ──────────────────────────────────────────────────

describe("ClientScheme", () => {
  /** Create a mock client signer */
  function mockClientSigner(utxos: any[], address = "kaspa:qtest") {
    return {
      address,
      resolveAddress: (addr: string) => ({ version: 0, script: "20" + addr + "ac" }),
      getUtxos: async () => utxos,
      signTransaction: async (outputs: any[], inputs: any[]) =>
        JSON.stringify({ outputs: outputs.length, inputs: inputs.length }),
    };
  }

  const mkUtxo = (amount: number) => ({
    transactionId: "aa".repeat(32),
    index: 0,
    amount: BigInt(amount),
    scriptPublicKey: { version: 0, script: "20" + "bb".repeat(32) + "ac" },
    blockDaaScore: 0n,
    isCoinbase: false,
  });

  const requirements = {
    scheme: "exact",
    network: "kaspa:mainnet",
    asset: "native",
    amount: "100000000", // 1 KAS
    payTo: "kaspa:qrecipient",
    maxTimeoutSeconds: 30,
    extra: {},
  };

  it("creates payment payload successfully", async () => {
    const signer = mockClientSigner([mkUtxo(200_000_000)]);
    const client = new ClientScheme(signer);
    const result = await client.createPaymentPayload(1, requirements);

    expect(result.x402Version).toBe(1);
    expect(result.payload.transaction).toBeTruthy();
  });

  it("throws on insufficient funds", async () => {
    const signer = mockClientSigner([mkUtxo(1000)]); // way too little
    const client = new ClientScheme(signer);

    await expect(() => client.createPaymentPayload(1, requirements)).rejects.toThrow(
      /Insufficient funds/,
    );
  });

  it("throws on unsupported asset", async () => {
    const signer = mockClientSigner([mkUtxo(200_000_000)]);
    const client = new ClientScheme(signer);

    await expect(() =>
      client.createPaymentPayload(1, { ...requirements, asset: "USDC" }),
    ).rejects.toThrow(/Invalid asset/);
  });
});

// ── Facilitator Scheme ─────────────────────────────────────────────

describe("FacilitatorScheme", () => {
  // Use a real Kaspa address so addressToScriptPublicKey works in validateTransaction.
  // Known test vector (privkey b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef):
  const payTo = "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva";
  const payToScript = "20dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659ac";

  function mockFacilitatorSigner(parseResult: any, verifyResult = true) {
    return {
      getAddresses: () => [payTo],
      parseTransaction: async () => parseResult,
      verifyTransaction: async () => verifyResult,
      submitTransaction: async () => "txid_" + "aa".repeat(31),
      waitForConfirmation: async () => true,
      getBalance: async () => 0n,
      getUtxos: async () => [],
    };
  }

  const requirements = {
    scheme: "exact",
    network: "kaspa:mainnet",
    asset: "native",
    amount: "100000000",
    payTo,
    maxTimeoutSeconds: 30,
    extra: {},
  };

  const mkPayload = (tx = '{"test": true}') => ({
    x402Version: 1,
    accepted: requirements,
    payload: { transaction: tx },
  });

  it("verify succeeds when signer returns script hex (UTXO model)", async () => {
    // This tests the real comparison path: signer returns script hex,
    // scheme converts payTo -> script, compares scripts.
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), requirements);

    expect(result.isValid).toBeTruthy();
    expect(result.payer).toBe("aa".repeat(32));
  });

  it("verify succeeds when signer returns kaspa address", async () => {
    // Also supports signers that return actual kaspa addresses.
    const signer = mockFacilitatorSigner({
      inputAddresses: ["kaspa:qpayer"],
      outputs: [{ address: payTo, amount: 100_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), requirements);

    expect(result.isValid).toBeTruthy();
    expect(result.payer).toBe("kaspa:qpayer");
  });

  it("verify fails on output mismatch", async () => {
    const wrongScript = "20" + "cc".repeat(32) + "ac";
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: wrongScript, amount: 100_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), requirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("output_mismatch");
  });

  it("verify fails on insufficient amount", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 50_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), requirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("output_mismatch");
  });

  it("verify fails on invalid signature", async () => {
    const signer = mockFacilitatorSigner(
      {
        inputAddresses: ["aa".repeat(32)],
        outputs: [{ address: payToScript, amount: 100_000_000n }],
      },
      false, // verifyTransaction returns false
    );
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), requirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("invalid_signature");
  });

  it("verify fails on missing transaction", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: [],
      outputs: [],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(
      { x402Version: 1, accepted: requirements, payload: {} },
      requirements,
    );

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("missing_transaction");
  });

  it("verify fails on unsupported asset", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: [],
      outputs: [],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), {
      ...requirements,
      asset: "USDC",
    });

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("unsupported_asset");
  });

  it("settle succeeds", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.settle(mkPayload(), requirements);

    expect(result.success).toBeTruthy();
    expect(result.transaction).toBeTruthy();
    expect(result.network).toBe("kaspa:mainnet");
  });

  it("settle rejects duplicate", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000_000n }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const payload = mkPayload('{"dup": true}');

    // First settle succeeds
    const r1 = await facilitator.settle(payload, requirements);
    expect(r1.success).toBeTruthy();

    // Second settle with same TX is rejected
    const r2 = await facilitator.settle(payload, requirements);
    expect(!r2.success).toBeTruthy();
    expect(r2.errorReason).toBe("duplicate_settlement");
  });

  it("getSigners returns addresses", () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: [],
      outputs: [],
    });
    const facilitator = new FacilitatorScheme(signer);
    expect(facilitator.getSigners("kaspa:mainnet")).toEqual([payTo]);
  });

  it("getExtra returns undefined", () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: [],
      outputs: [],
    });
    const facilitator = new FacilitatorScheme(signer);
    expect(facilitator.getExtra("kaspa:mainnet")).toBe(undefined);
  });
});

// ── Covenant: isCovenantAsset ────────────────────────────────────

const VALID_COVENANT_ID = "aa".repeat(32); // 64-char lowercase hex

describe("isCovenantAsset", () => {
  it("returns false for native", () => {
    expect(isCovenantAsset("native")).toBe(false);
  });

  it("returns true for valid 64-char hex", () => {
    expect(isCovenantAsset(VALID_COVENANT_ID)).toBe(true);
  });

  it("returns false for short hex", () => {
    expect(isCovenantAsset("aa".repeat(16))).toBe(false);
  });

  it("returns false for uppercase hex", () => {
    expect(isCovenantAsset("AA".repeat(32))).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCovenantAsset("")).toBe(false);
  });
});

// ── Covenant: validateAsset ──────────────────────────────────────

describe("validateAsset", () => {
  it("accepts native", () => {
    expect(() => validateAsset("native")).not.toThrow();
  });

  it("accepts valid covenant ID", () => {
    expect(() => validateAsset(VALID_COVENANT_ID)).not.toThrow();
  });

  it("rejects arbitrary string (USDC)", () => {
    expect(() => validateAsset("USDC")).toThrow(/Invalid asset/);
  });

  it("rejects short hex", () => {
    expect(() => validateAsset("aa".repeat(16))).toThrow(/Invalid asset/);
  });
});

// ── Covenant: ServerScheme ───────────────────────────────────────

describe("ServerScheme (covenant)", () => {
  const server = new ServerScheme();

  it("accepts covenant token asset", async () => {
    const result = await server.parsePrice(
      { asset: VALID_COVENANT_ID, amount: "1000" },
      "kaspa:mainnet",
    );
    expect(result.asset).toBe(VALID_COVENANT_ID);
    expect(result.amount).toBe("1000");
  });

  it("native still works unchanged", async () => {
    const result = await server.parsePrice(1.0, "kaspa:mainnet");
    expect(result.asset).toBe("native");
    expect(result.amount).toBe("100000000");
  });

  it("rejects invalid asset string", async () => {
    await expect(() =>
      server.parsePrice({ asset: "USDC", amount: "100" }, "kaspa:mainnet"),
    ).rejects.toThrow(/Invalid asset/);
  });
});

// ── Covenant: ClientScheme ───────────────────────────────────────

describe("ClientScheme (covenant)", () => {
  const mkUtxo = (amount: number, covenantId?: string) => ({
    transactionId: "aa".repeat(32),
    index: 0,
    amount: BigInt(amount),
    scriptPublicKey: { version: 0, script: "20" + "bb".repeat(32) + "ac" },
    blockDaaScore: 0n,
    isCoinbase: false,
    ...(covenantId ? { covenantId } : {}),
  });

  function mockClientSigner(utxos: any[], address = "kaspa:qtest") {
    return {
      address,
      resolveAddress: (addr: string) => ({ version: 0, script: "20" + addr + "ac" }),
      getUtxos: async () => utxos,
      signTransaction: async (outputs: any[], inputs: any[]) =>
        JSON.stringify({ outputs, inputs: inputs.length }, bigIntToNumberReplacer),
    };
  }

  it("creates token payment with covenant binding on outputs", async () => {
    const utxos = [
      mkUtxo(500_000, VALID_COVENANT_ID), // token
      mkUtxo(100_000), // KAS for fee
    ];
    const signer = mockClientSigner(utxos);
    const client = new ClientScheme(signer);
    const result = await client.createPaymentPayload(1, {
      scheme: "exact",
      network: "kaspa:mainnet",
      asset: VALID_COVENANT_ID,
      amount: "200000",
      payTo: "kaspa:qrecipient",
      maxTimeoutSeconds: 30,
      extra: {},
    });

    const tx = JSON.parse(result.payload.transaction);
    // First output: token payment to recipient with covenant
    expect(tx.outputs[0].covenant).toBeTruthy();
    expect(tx.outputs[0].covenant.covenantId).toBe(VALID_COVENANT_ID);
    expect(tx.outputs[0].covenant.authorizingInput).toBe(0);
    // Second output: token change to self with covenant
    expect(tx.outputs[1].covenant).toBeTruthy();
    expect(tx.outputs[1].covenant.covenantId).toBe(VALID_COVENANT_ID);
  });

  it("throws on insufficient token funds", async () => {
    const utxos = [
      mkUtxo(100, VALID_COVENANT_ID), // too little token
      mkUtxo(100_000), // plenty of KAS
    ];
    const signer = mockClientSigner(utxos);
    const client = new ClientScheme(signer);

    await expect(() =>
      client.createPaymentPayload(1, {
        scheme: "exact",
        network: "kaspa:mainnet",
        asset: VALID_COVENANT_ID,
        amount: "200000",
        payTo: "kaspa:qrecipient",
        maxTimeoutSeconds: 30,
        extra: {},
      }),
    ).rejects.toThrow(/Insufficient token funds/);
  });

  it("throws on insufficient KAS for fee", async () => {
    const utxos = [
      mkUtxo(500_000, VALID_COVENANT_ID), // enough token
      mkUtxo(1), // not enough KAS for fee
    ];
    const signer = mockClientSigner(utxos);
    const client = new ClientScheme(signer);

    await expect(() =>
      client.createPaymentPayload(1, {
        scheme: "exact",
        network: "kaspa:mainnet",
        asset: VALID_COVENANT_ID,
        amount: "200000",
        payTo: "kaspa:qrecipient",
        maxTimeoutSeconds: 30,
        extra: {},
      }),
    ).rejects.toThrow(/Insufficient KAS for fee/);
  });

  it("ignores UTXOs with wrong covenantId", async () => {
    const wrongId = "bb".repeat(32);
    const utxos = [
      mkUtxo(500_000, wrongId), // wrong covenant
      mkUtxo(100_000), // KAS
    ];
    const signer = mockClientSigner(utxos);
    const client = new ClientScheme(signer);

    await expect(() =>
      client.createPaymentPayload(1, {
        scheme: "exact",
        network: "kaspa:mainnet",
        asset: VALID_COVENANT_ID,
        amount: "200000",
        payTo: "kaspa:qrecipient",
        maxTimeoutSeconds: 30,
        extra: {},
      }),
    ).rejects.toThrow(/Insufficient token funds/);
  });

  it("native path still works unchanged", async () => {
    const utxos = [mkUtxo(200_000_000)];
    const signer = mockClientSigner(utxos);
    const client = new ClientScheme(signer);
    const result = await client.createPaymentPayload(1, {
      scheme: "exact",
      network: "kaspa:mainnet",
      asset: "native",
      amount: "100000000",
      payTo: "kaspa:qrecipient",
      maxTimeoutSeconds: 30,
      extra: {},
    });

    expect(result.x402Version).toBe(1);
    expect(result.payload.transaction).toBeTruthy();
  });
});

// ── Covenant: FacilitatorScheme ──────────────────────────────────

describe("FacilitatorScheme (covenant)", () => {
  const payTo = "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva";
  const payToScript = "20dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659ac";

  function mockFacilitatorSigner(parseResult: any, verifyResult = true) {
    return {
      getAddresses: () => [payTo],
      parseTransaction: async () => parseResult,
      verifyTransaction: async () => verifyResult,
      submitTransaction: async () => "txid_" + "aa".repeat(31),
      waitForConfirmation: async () => true,
      getBalance: async () => 0n,
      getUtxos: async () => [],
    };
  }

  const covenantRequirements = {
    scheme: "exact",
    network: "kaspa:mainnet",
    asset: VALID_COVENANT_ID,
    amount: "100000",
    payTo,
    maxTimeoutSeconds: 30,
    extra: {},
  };

  const nativeRequirements = {
    scheme: "exact",
    network: "kaspa:mainnet",
    asset: "native",
    amount: "100000000",
    payTo,
    maxTimeoutSeconds: 30,
    extra: {},
  };

  const mkPayload = (tx = '{"test": "covenant"}') => ({
    x402Version: 1,
    accepted: covenantRequirements,
    payload: { transaction: tx },
  });

  it("verify succeeds with correct covenantId", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000n, covenantId: VALID_COVENANT_ID }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), covenantRequirements);

    expect(result.isValid).toBeTruthy();
  });

  it("verify fails with wrong covenantId", async () => {
    const wrongId = "bb".repeat(32);
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000n, covenantId: wrongId }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), covenantRequirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("output_mismatch");
  });

  it("verify fails when covenantId missing on token requirement", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000n }], // no covenantId
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), covenantRequirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("output_mismatch");
  });

  it("native verify rejects unexpected covenantId on output", async () => {
    const signer = mockFacilitatorSigner({
      inputAddresses: ["aa".repeat(32)],
      outputs: [{ address: payToScript, amount: 100_000_000n, covenantId: VALID_COVENANT_ID }],
    });
    const facilitator = new FacilitatorScheme(signer);
    const result = await facilitator.verify(mkPayload(), nativeRequirements);

    expect(!result.isValid).toBeTruthy();
    expect(result.invalidReason).toBe("output_mismatch");
  });
});
