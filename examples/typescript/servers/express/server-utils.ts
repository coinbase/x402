type EnvLike = Record<string, string | undefined>;

export type EnvConfig = {
  evmAddress: `0x${string}`;
  svmAddress: string;
  facilitatorUrl: string;
  port: number;
};

export type ErrorEnvelope = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
  };
};

const parsePort = (rawPort: string | undefined): number => {
  if (!rawPort) {
    return 4021;
  }

  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("Invalid PORT, expected integer in range 1-65535");
  }

  return parsed;
};

export const readEnvConfig = (env: EnvLike): EnvConfig => {
  const evmAddress = env.EVM_ADDRESS as `0x${string}` | undefined;
  const svmAddress = env.SVM_ADDRESS;
  const facilitatorUrl = env.FACILITATOR_URL;

  if (!evmAddress || !svmAddress || !facilitatorUrl) {
    throw new Error(
      "Missing required environment variables: EVM_ADDRESS, SVM_ADDRESS, FACILITATOR_URL",
    );
  }

  return {
    evmAddress,
    svmAddress,
    facilitatorUrl,
    port: parsePort(env.PORT),
  };
};

export const buildErrorEnvelope = (
  code: string,
  message: string,
  requestId: string,
): ErrorEnvelope => ({
  ok: false,
  requestId,
  error: {
    code,
    message,
  },
});
