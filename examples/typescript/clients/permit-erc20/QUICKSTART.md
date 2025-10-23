# EIP-2612 Permit 快速启动指南

## 🎯 验证 Permit 支持

按以下步骤验证 x402 的 EIP-2612 Permit 支持：

## 📋 前置要求

### 1. 准备钱包和资金

您需要一个钱包，包含：
- ✅ **DAI 代币** (或其他支持 EIP-2612 的 ERC20)
- ✅ **ETH** (少量，用于 gas 费)

**获取测试代币:**
- Base 主网: 从交易所提款或使用 DEX 兑换
- 测试网: 使用水龙头

### 2. 安装依赖

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript
pnpm install
```

## 🚀 运行步骤

### 步骤 1: 配置 Facilitator

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/facilitator
cp .env-local .env
```

编辑 `.env`：
```bash
EVM_PRIVATE_KEY=0xYOUR_FACILITATOR_PRIVATE_KEY
PORT=3002
```

### 步骤 2: 配置 Permit 客户端

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/clients/permit-erc20
cp .env-local .env
```

编辑 `.env`：
```bash
CLIENT_PRIVATE_KEY=0xYOUR_CLIENT_PRIVATE_KEY
PROVIDER_URL=https://base.blockpi.network/v1/rpc/b6e3eb324f795e5dca573bd6eb3950fbe0ba8f7a
```

### 步骤 3: 安装示例依赖

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/clients/permit-erc20
pnpm install
```

## 🎬 启动测试

打开**三个终端**:

### 🟦 终端 1 - Facilitator

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/facilitator
pnpm dev
```

**预期输出:**
```
═══════════════════════════════════════════════════════
  X402 Facilitator Server
═══════════════════════════════════════════════════════
  Server listening at http://localhost:3002

  Supported Authorization Types:
    ✅ EIP-3009  - USDC/EURC transferWithAuthorization
    ✅ EIP-2612  - Standard ERC20 Permit
    ✅ Permit2   - Universal token approvals (any ERC20)
═══════════════════════════════════════════════════════
```

### 🟩 终端 2 - Resource Server

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/clients/permit-erc20
pnpm run resource
```

**预期输出:**
```
═══════════════════════════════════════════
  EIP-2612 Permit Resource Server
═══════════════════════════════════════════
  Port: 4024
  Token: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb (DAI)
  Payment: 1000000000000000000 wei (1 DAI)
  Facilitator: http://localhost:3002
═══════════════════════════════════════════
```

### 🟨 终端 3 - Client

```bash
cd /Users/daxiongya/Desktop/Projects/web3/x402/x402/examples/typescript/clients/permit-erc20
pnpm run client
```

**预期输出:**
```
═══════════════════════════════════════════
   EIP-2612 Permit x402 Example
═══════════════════════════════════════════

🚀 Making request to resource server...

💰 402 Payment Required
   Payment details: { ... }

🔐 Creating Permit payment header...
   Client: 0xYourAddress
   Token: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
   Amount: 1000000000000000000
   Current nonce: 0
   ✅ Permit signed!

🔄 Retrying with payment...

✅ Success!
   Response: {
     message: "Payment verified and settled successfully with EIP-2612 Permit!",
     authorizationType: "permit",
     payer: "0xYourAddress"
   }
```

## ✅ 验证成功标志

如果看到以下日志，说明 Permit 支持正常工作：

### Facilitator 日志
```
POST /verify
✅ Received permit authorization
✅ Signature verified
✅ Balance checked

POST /settle
✅ Called permit()
✅ Called transferFrom()
✅ Settlement successful
```

### Resource Server 日志
```
📥 Received POST /protected-resource
💰 No X-PAYMENT header, responding 402
📥 Received POST /protected-resource (with payment)
🔐 Verifying payment with Facilitator...
✅ Facilitator verify response: { isValid: true }
💸 Settling payment with Facilitator...
✅ Facilitator settle response: { success: true }
✅ Responding 200 OK to client
```

### Client 日志
```
✅ Success!
   Response: {
     message: "Payment verified and settled successfully with EIP-2612 Permit!"
   }
```

## 🔍 关键验证点

1. ✅ Client 成功创建 Permit 签名
2. ✅ Facilitator 正确验证 Permit 签名
3. ✅ Facilitator 调用 `permit()` 批准
4. ✅ Facilitator 调用 `transferFrom()` 转账
5. ✅ Resource Server 收到 200 OK

## 🐛 常见问题

### "Missing CLIENT_PRIVATE_KEY"
编辑 `.env` 文件，添加您的私钥

### "insufficient_funds"
确保钱包有足够的 DAI 和 ETH

### "Facilitator verification failed"
- 检查 Facilitator 是否在运行 (端口 3002)
- 查看 Facilitator 终端的错误日志

### "invalid_permit_signature"
- 检查代币地址是否正确
- 确认代币支持 EIP-2612

## 🎓 理解工作原理

### 1. Client 签名 Permit (离链)
```typescript
signature = await wallet.signTypedData({
  types: { Permit: [...] },
  message: {
    owner: clientAddress,
    spender: facilitatorAddress,
    value: amount,
    nonce: currentNonce,
    deadline: expirationTime,
  }
});
```

### 2. Facilitator 验证 (离链)
```typescript
const isValid = await verifyTypedData({
  address: owner,
  signature,
  ...permitData
});
```

### 3. Facilitator 结算 (链上 - 2 笔交易)
```typescript
// 交易 1: 批准
await token.permit(owner, spender, value, deadline, v, r, s);

// 交易 2: 转账
await token.transferFrom(owner, payTo, amount);
```

## 📊 与 EIP-3009 对比

| 特性 | EIP-3009 | EIP-2612 |
|------|----------|----------|
| **代币** | USDC only | DAI, UNI, AAVE, etc. |
| **交易数** | 1 | **2** |
| **Gas** | ~70k | ~110k |
| **Nonce** | 自定义 bytes32 | 顺序 uint256 |

## 🎯 下一步

- ✅ 尝试 Permit2 示例 (支持任何 ERC20)
- ✅ 测试不同的 ERC20 代币
- ✅ 对比三种授权方式的 gas 消耗

## 📚 相关资源

- [EIP-2612 规范](https://eips.ethereum.org/EIPS/eip-2612)
- [完整文档](../../../AUTHORIZATION_TYPES.md)
- [Permit2 示例](../permit2-universal/README.md)

