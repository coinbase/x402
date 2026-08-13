import { AccountRole, generateKeyPairSigner } from "@solana/kit";
import type { Network } from "@x402/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SOLANA_DEVNET_CAIP2, TOKEN_PROGRAM_ADDRESS } from "../../src/constants";
import { USDC_DEVNET_ADDRESS } from "../../src/defaultAssets";
import {
  buildReclaimInstruction,
  ChannelStatus,
  RECLAIM_DISCRIMINATOR,
} from "../../src/payment-channels/onchain";
import { OPEN_SLOT_WINDOW } from "../../src/payment-channels/open";
import { toFacilitatorSvmSigner } from "../../src/signer";
import { InMemoryUptoChannelStorage } from "../../src/upto/facilitator/channelStorage";
import type { UptoChannelRecord } from "../../src/upto/facilitator/channelStorage";
import { UptoSvmRentCleanupManager } from "../../src/upto/facilitator/rentCleanupManager";
import { UptoSvmScheme } from "../../src/upto/facilitator/scheme";

const NETWORK = SOLANA_DEVNET_CAIP2 as Network;
const OPEN_SLOT = 100n;
const CURRENT_SLOT_READY = OPEN_SLOT + OPEN_SLOT_WINDOW + 1n;
const CURRENT_SLOT_TOO_EARLY = OPEN_SLOT + OPEN_SLOT_WINDOW;
const FAR_FUTURE = 4_102_444_800;

const fetchMaybeChannelMock = vi.hoisted(() => vi.fn());
const submitSettleMock = vi.hoisted(() => vi.fn());
const buildDistributeMock = vi.hoisted(() => vi.fn());
const getSlotMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/payment-channels/generated/accounts/channel", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/payment-channels/generated/accounts/channel")
  >("../../src/payment-channels/generated/accounts/channel");
  return {
    ...actual,
    fetchMaybeChannel: fetchMaybeChannelMock,
  };
});

vi.mock("../../src/upto/facilitator/channel", async () => {
  const actual = await vi.importActual<typeof import("../../src/upto/facilitator/channel")>(
    "../../src/upto/facilitator/channel",
  );
  return {
    ...actual,
    submitSettle: submitSettleMock,
  };
});

vi.mock("../../src/payment-channels/onchain", async () => {
  const actual = await vi.importActual<typeof import("../../src/payment-channels/onchain")>(
    "../../src/payment-channels/onchain",
  );
  return {
    ...actual,
    buildDistributeInstruction: buildDistributeMock,
  };
});

vi.mock("../../src/utils", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils")>("../../src/utils");
  return {
    ...actual,
    createRpcClient: () => ({
      getSlot: () => ({ send: getSlotMock }),
    }),
  };
});

describe("payment-channel reclaim primitive", () => {
  it("exports OPEN_SLOT_WINDOW and builds reclaim with disc 9", async () => {
    expect(OPEN_SLOT_WINDOW).toBe(1_500n);
    expect(ChannelStatus.Open).toBe(0);
    expect(ChannelStatus.Distributed).toBe(3);

    const channel = await generateKeyPairSigner();
    const rentPayer = await generateKeyPairSigner();
    const ix = buildReclaimInstruction({
      channelId: channel.address,
      rentPayer: rentPayer.address,
    });
    expect(ix.data[0]).toBe(RECLAIM_DISCRIMINATOR);
    expect(ix.accounts).toHaveLength(2);
    expect(ix.accounts[0]?.role).toBe(AccountRole.WRITABLE);
    expect(ix.accounts[1]?.role).toBe(AccountRole.WRITABLE);
  });
});

describe("UptoChannelStorage + scheme wiring", () => {
  it("upserts on verify success, retains after settle, deletes when PDA gone", async () => {
    const feePayer = await generateKeyPairSigner();
    const channel = await generateKeyPairSigner();
    const payTo = await generateKeyPairSigner();
    const storage = new InMemoryUptoChannelStorage();
    const scheme = new UptoSvmScheme(toFacilitatorSvmSigner(feePayer), {
      channelStorage: storage,
    });

    const record: UptoChannelRecord = {
      channelId: channel.address,
      payTo: payTo.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      firstSeenAt: Date.now() - 10_000,
      expiresAt: FAR_FUTURE,
      network: NETWORK,
    };
    await storage.upsert(record);
    expect(await storage.get(record.channelId)).toMatchObject({
      payTo: record.payTo,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const firstSeenAt = (await storage.get(record.channelId))!.firstSeenAt;
    await storage.upsert({ ...record, firstSeenAt: Date.now(), expiresAt: FAR_FUTURE - 100 });
    expect((await storage.get(record.channelId))!.firstSeenAt).toBe(firstSeenAt);
    expect((await storage.get(record.channelId))!.expiresAt).toBe(FAR_FUTURE);

    const manager = scheme.createRentCleanupManager(NETWORK);
    fetchMaybeChannelMock.mockResolvedValue({ exists: false });
    await manager.cleanup();
    expect(await storage.get(record.channelId)).toBeUndefined();
  });

  it("createRentCleanupManager returns a manager bound to the scheme storage", async () => {
    const feePayer = await generateKeyPairSigner();
    const scheme = new UptoSvmScheme(toFacilitatorSvmSigner(feePayer));
    const manager = scheme.createRentCleanupManager(NETWORK);
    expect(manager).toBeInstanceOf(UptoSvmRentCleanupManager);
    expect(scheme.getChannelStorage()).toBeInstanceOf(InMemoryUptoChannelStorage);
  });
});

describe("UptoSvmRentCleanupManager — cleanup", () => {
  let feePayer: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let payer: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let payTo: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let storage: InMemoryUptoChannelStorage;
  let manager: UptoSvmRentCleanupManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    feePayer = await generateKeyPairSigner();
    payer = await generateKeyPairSigner();
    payTo = await generateKeyPairSigner();
    storage = new InMemoryUptoChannelStorage();
    manager = new UptoSvmRentCleanupManager({
      network: NETWORK,
      signer: toFacilitatorSvmSigner(feePayer),
      storage,
    });
    submitSettleMock.mockResolvedValue("Sig11111111111111111111111111111111111111111");
    buildDistributeMock.mockResolvedValue({
      accounts: [],
      data: new Uint8Array([7]),
      programAddress: "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX",
    });
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);
  });

  /**
   * @param overrides - Partial live channel account fields
   */
  function channelAccount(overrides: {
    status: ChannelStatus;
    openSlot?: bigint;
    payee?: string;
    rentPayer?: string;
    payer?: string;
    mint?: string;
  }) {
    return {
      exists: true as const,
      data: {
        status: overrides.status,
        openSlot: overrides.openSlot ?? OPEN_SLOT,
        payee: overrides.payee ?? feePayer.address,
        rentPayer: overrides.rentPayer ?? feePayer.address,
        payer: overrides.payer ?? payer.address,
        mint: overrides.mint ?? USDC_DEVNET_ADDRESS,
      },
    };
  }

  /**
   * @param overrides - Record field overrides
   */
  async function seed(overrides: Partial<UptoChannelRecord> = {}) {
    const channel = overrides.channelId
      ? { address: overrides.channelId }
      : await generateKeyPairSigner();
    const record: UptoChannelRecord = {
      channelId: channel.address,
      payTo: overrides.payTo ?? payTo.address,
      tokenProgram: overrides.tokenProgram ?? TOKEN_PROGRAM_ADDRESS,
      firstSeenAt: overrides.firstSeenAt ?? Date.now() - 7_200_000,
      expiresAt: overrides.expiresAt ?? FAR_FUTURE,
      network: overrides.network ?? NETWORK,
    };
    await storage.upsert(record);
    return record;
  }

  it("does not abandon-close Open channels before expiry plus grace", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    const record = await seed({
      firstSeenAt: Date.now() - 60_000,
      expiresAt: nowSecs + 300,
    });
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Open }));

    const onClose = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, onClose });
    expect(onClose).not.toHaveBeenCalled();
    expect(submitSettleMock).not.toHaveBeenCalled();
    expect(await storage.get(record.channelId)).toBeDefined();
  });

  it("abandon-closes Open channels after expiry plus grace", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    const record = await seed({
      firstSeenAt: Date.now() - 60_000,
      expiresAt: nowSecs - 200,
    });
    fetchMaybeChannelMock
      .mockResolvedValueOnce(channelAccount({ status: ChannelStatus.Open }))
      .mockResolvedValueOnce({ exists: false });

    const onClose = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, onClose });

    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: record.channelId, action: "abandon_close" }),
    );
    expect(submitSettleMock).toHaveBeenCalledTimes(1);
    const instructions = submitSettleMock.mock.calls[0]![2] as unknown[];
    expect(instructions.length).toBeGreaterThanOrEqual(2);
    expect(await storage.get(record.channelId)).toBeUndefined();
  });

  it("does not abandon-close Open channels before expiresAt even when firstSeen is old", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    const record = await seed({
      firstSeenAt: Date.now() - 7_200_000,
      expiresAt: nowSecs + 300,
    });
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Open }));

    const onClose = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, onClose });

    expect(onClose).not.toHaveBeenCalled();
    expect(submitSettleMock).not.toHaveBeenCalled();
    expect(await storage.get(record.channelId)).toBeDefined();
  });

  it("distributes Sealed channels", async () => {
    const record = await seed();
    fetchMaybeChannelMock
      .mockResolvedValueOnce(channelAccount({ status: ChannelStatus.Sealed }))
      .mockResolvedValueOnce({ exists: false });

    const onClose = vi.fn();
    await manager.cleanup({ onClose });
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: record.channelId, action: "distribute" }),
    );
    const instructions = submitSettleMock.mock.calls[0]![2] as unknown[];
    expect(instructions).toHaveLength(1);
  });

  it("defers Closing channels", async () => {
    await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Closing }));
    const onClose = vi.fn();
    const onReclaim = vi.fn();
    await manager.cleanup({ onClose, onReclaim });
    expect(onClose).not.toHaveBeenCalled();
    expect(onReclaim).not.toHaveBeenCalled();
    expect(submitSettleMock).not.toHaveBeenCalled();
  });

  it("defers Distributed reclaim until the open-slot gate elapses", async () => {
    await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Distributed }));
    getSlotMock.mockResolvedValue(CURRENT_SLOT_TOO_EARLY);

    const onReclaim = vi.fn();
    await manager.cleanup({ onReclaim });
    expect(onReclaim).not.toHaveBeenCalled();
    expect(submitSettleMock).not.toHaveBeenCalled();
  });

  it("batch-reclaims Distributed channels after the open-slot gate", async () => {
    const a = await seed();
    const b = await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Distributed }));
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);

    const onReclaim = vi.fn();
    await manager.cleanup({ maxReclaimsPerTx: 8, onReclaim });

    expect(onReclaim).toHaveBeenCalledTimes(1);
    expect(onReclaim.mock.calls[0]![0].channelIds).toEqual(
      expect.arrayContaining([a.channelId, b.channelId]),
    );
    const instructions = submitSettleMock.mock.calls[0]![2] as { data: Uint8Array }[];
    expect(instructions).toHaveLength(2);
    expect(instructions.every(ix => ix.data[0] === RECLAIM_DISCRIMINATOR)).toBe(true);
    // Reclaim batches carry a per-channel compute-unit limit (base + 2 × per-channel).
    expect(submitSettleMock.mock.calls[0]![3]).toMatchObject({ computeUnitLimit: 35_000 });
    expect(await storage.get(a.channelId)).toBeUndefined();
    expect(await storage.get(b.channelId)).toBeUndefined();
  });

  // A failed batch strands every channel in it, so reporting only the first
  // would hide the rest from the operator watching onError.
  it("reports every channel in a reclaim batch that failed to broadcast", async () => {
    const a = await seed();
    const b = await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Distributed }));
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);
    submitSettleMock.mockRejectedValue(new Error("broadcast failed"));

    const onError = vi.fn();
    const onReclaim = vi.fn();
    await manager.cleanup({ maxReclaimsPerTx: 8, onError, onReclaim });

    expect(onReclaim).not.toHaveBeenCalled();
    expect(onError.mock.calls.map(call => call[1]?.channelId)).toEqual(
      expect.arrayContaining([a.channelId, b.channelId]),
    );
  });

  it("respects maxReclaimsPerTx and maxTxsPerRun for reclaim batching", async () => {
    await seed();
    await seed();
    await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Distributed }));
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);

    const onReclaim = vi.fn();
    await manager.cleanup({ maxReclaimsPerTx: 2, maxTxsPerRun: 1, onReclaim });

    expect(onReclaim).toHaveBeenCalledTimes(1);
    expect(onReclaim.mock.calls[0]![0].channelIds).toHaveLength(2);
    expect(submitSettleMock).toHaveBeenCalledTimes(1);
  });

  it("skips reclaim when a concurrent settle already changed status (stale refetch)", async () => {
    const record = await seed();
    fetchMaybeChannelMock
      .mockResolvedValueOnce(channelAccount({ status: ChannelStatus.Distributed }))
      .mockResolvedValueOnce({ exists: false });
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);

    const onReclaim = vi.fn();
    await manager.cleanup({ onReclaim });
    expect(onReclaim).not.toHaveBeenCalled();
    expect(submitSettleMock).not.toHaveBeenCalled();
    expect(await storage.get(record.channelId)).toBeUndefined();
  });

  it("skips channels with missing payTo and surfaces onError", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    await seed({ payTo: "", firstSeenAt: Date.now() - 7_200_000, expiresAt: nowSecs - 200 });
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Open }));

    const onError = vi.fn();
    const onClose = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, onClose, onError });
    expect(onClose).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing payTo") }),
      expect.objectContaining({ channelId: expect.any(String) }),
    );
  });

  // The close cap must not end the record scan: reclaims are budgeted separately,
  // so a backlog of closable channels would otherwise strand rent forever.
  it("still reclaims when the close budget is spent", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    const closable = await seed({ expiresAt: nowSecs - 200 });
    const distributed = await seed({ expiresAt: nowSecs - 200 });
    fetchMaybeChannelMock.mockImplementation((_rpc: unknown, channelId: string) => {
      if (channelId === closable.channelId) {
        return Promise.resolve(channelAccount({ status: ChannelStatus.Open }));
      }
      if (channelId === distributed.channelId) {
        return Promise.resolve(channelAccount({ status: ChannelStatus.Distributed }));
      }
      return Promise.resolve({ exists: false });
    });
    getSlotMock.mockResolvedValue(CURRENT_SLOT_READY);

    const onReclaim = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, maxClosesPerRun: 0, onReclaim });

    expect(onReclaim).toHaveBeenCalledTimes(1);
    expect(onReclaim.mock.calls[0]![0].channelIds).toEqual([distributed.channelId]);
  });

  // An unrecognized status has no cleanup path, so the record would sit in storage
  // forever without the operator ever hearing about it.
  it("reports an unrecognized channel status", async () => {
    const record = await seed();
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: 99 as ChannelStatus }));

    const onError = vi.fn();
    const onClose = vi.fn();
    const onReclaim = vi.fn();
    await manager.cleanup({ onClose, onError, onReclaim });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("unrecognized status") }),
      expect.objectContaining({ channelId: record.channelId }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onReclaim).not.toHaveBeenCalled();
    expect(await storage.get(record.channelId)).toBeDefined();
  });

  // An operator cron calling cleanup() must not race the interval loop into
  // submitting the same close twice.
  it("runs overlapping passes serially", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    await seed({ expiresAt: nowSecs - 200 });
    fetchMaybeChannelMock.mockResolvedValue(channelAccount({ status: ChannelStatus.Sealed }));

    let inFlight = 0;
    let overlapped = false;
    submitSettleMock.mockImplementation(async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight -= 1;
      return "Sig11111111111111111111111111111111111111111";
    });

    await Promise.all([manager.cleanup({}), manager.cleanup({}), manager.cleanup({})]);

    expect(overlapped).toBe(false);
  });

  it("skips channels whose feePayer is not in the signer set", async () => {
    const nowSecs = Math.floor(Date.now() / 1_000);
    const other = await generateKeyPairSigner();
    await seed({ firstSeenAt: Date.now() - 7_200_000, expiresAt: nowSecs - 200 });
    fetchMaybeChannelMock.mockResolvedValue(
      channelAccount({
        status: ChannelStatus.Open,
        payee: other.address,
        rentPayer: other.address,
      }),
    );

    const onError = vi.fn();
    await manager.cleanup({ abandonGraceSecs: 120, onError });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not in facilitator signer set"),
      }),
      expect.any(Object),
    );
    expect(submitSettleMock).not.toHaveBeenCalled();
  });
});
