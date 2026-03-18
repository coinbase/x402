import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUptoEvmScheme as registerUptoClient } from "../../../src/upto/client/register";
import { registerUptoEvmScheme as registerUptoFacilitator } from "../../../src/upto/facilitator/register";
import { registerUptoEvmScheme as registerUptoServer } from "../../../src/upto/server/register";
import type { ClientEvmSigner, FacilitatorEvmSigner } from "../../../src/signer";

function makeMockClient() {
  return {
    register: vi.fn().mockReturnThis(),
    registerPolicy: vi.fn().mockReturnThis(),
  };
}

function makeMockFacilitator() {
  return {
    register: vi.fn().mockReturnThis(),
  };
}

function makeMockServer() {
  return {
    register: vi.fn().mockReturnThis(),
  };
}

const FACILITATOR_ADDRESS = "0xFAC11174700123456789012345678901234aBCDe" as `0x${string}`;

describe("registerUptoEvmScheme (Client)", () => {
  let mockSigner: ClientEvmSigner;

  beforeEach(() => {
    mockSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn(),
    };
  });

  it("should register with wildcard eip155:* by default", () => {
    const client = makeMockClient();
    registerUptoClient(client as any, { signer: mockSigner });

    expect(client.register).toHaveBeenCalledTimes(1);
    expect(client.register).toHaveBeenCalledWith("eip155:*", expect.any(Object));
  });

  it("should register for each specified network", () => {
    const client = makeMockClient();
    registerUptoClient(client as any, {
      signer: mockSigner,
      networks: ["eip155:8453", "eip155:84532"],
    });

    expect(client.register).toHaveBeenCalledTimes(2);
    expect(client.register).toHaveBeenCalledWith("eip155:8453", expect.any(Object));
    expect(client.register).toHaveBeenCalledWith("eip155:84532", expect.any(Object));
  });

  it("should register policies when provided", () => {
    const client = makeMockClient();
    const policy = vi.fn();
    registerUptoClient(client as any, {
      signer: mockSigner,
      policies: [policy],
    });

    expect(client.registerPolicy).toHaveBeenCalledTimes(1);
    expect(client.registerPolicy).toHaveBeenCalledWith(policy);
  });

  it("should not register policies when none provided", () => {
    const client = makeMockClient();
    registerUptoClient(client as any, { signer: mockSigner });

    expect(client.registerPolicy).not.toHaveBeenCalled();
  });

  it("should return the client for chaining", () => {
    const client = makeMockClient();
    const result = registerUptoClient(client as any, { signer: mockSigner });

    expect(result).toBe(client);
  });
});

describe("registerUptoEvmScheme (Facilitator)", () => {
  let mockSigner: FacilitatorEvmSigner;

  beforeEach(() => {
    mockSigner = {
      getAddresses: () => [FACILITATOR_ADDRESS],
      readContract: vi.fn(),
      verifyTypedData: vi.fn(),
      writeContract: vi.fn(),
      sendTransaction: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
      getCode: vi.fn(),
    };
  });

  it("should register with a single network", () => {
    const facilitator = makeMockFacilitator();
    registerUptoFacilitator(facilitator as any, {
      signer: mockSigner,
      networks: "eip155:8453",
    });

    expect(facilitator.register).toHaveBeenCalledTimes(1);
    expect(facilitator.register).toHaveBeenCalledWith("eip155:8453", expect.any(Object));
  });

  it("should register with multiple networks", () => {
    const facilitator = makeMockFacilitator();
    registerUptoFacilitator(facilitator as any, {
      signer: mockSigner,
      networks: ["eip155:8453", "eip155:84532"],
    });

    expect(facilitator.register).toHaveBeenCalledTimes(1);
    expect(facilitator.register).toHaveBeenCalledWith(
      ["eip155:8453", "eip155:84532"],
      expect.any(Object),
    );
  });

  it("should return the facilitator for chaining", () => {
    const facilitator = makeMockFacilitator();
    const result = registerUptoFacilitator(facilitator as any, {
      signer: mockSigner,
      networks: "eip155:8453",
    });

    expect(result).toBe(facilitator);
  });
});

describe("registerUptoEvmScheme (Server)", () => {
  it("should register with wildcard eip155:* by default", () => {
    const server = makeMockServer();
    registerUptoServer(server as any);

    expect(server.register).toHaveBeenCalledTimes(1);
    expect(server.register).toHaveBeenCalledWith("eip155:*", expect.any(Object));
  });

  it("should register for each specified network", () => {
    const server = makeMockServer();
    registerUptoServer(server as any, {
      networks: ["eip155:8453", "eip155:84532"],
    });

    expect(server.register).toHaveBeenCalledTimes(2);
    expect(server.register).toHaveBeenCalledWith("eip155:8453", expect.any(Object));
    expect(server.register).toHaveBeenCalledWith("eip155:84532", expect.any(Object));
  });

  it("should return the server for chaining", () => {
    const server = makeMockServer();
    const result = registerUptoServer(server as any);

    expect(result).toBe(server);
  });
});
