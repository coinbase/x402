# BSC 网络支持

x402 协议现已支持 BSC（Binance Smart Chain）主网和测试网。

## 支持的网络

- **BSC 主网**: `bsc` (Chain ID: 56)
- **BSC 测试网**: `bsc-testnet` (Chain ID: 97)

## 使用方法

### TypeScript/JavaScript

```typescript
import { paymentMiddleware } from "@coinbase/x402-express";

app.use(
  paymentMiddleware("0xYourAddress", {
    "/your-endpoint": "$0.01"
  }, {
    network: "bsc" // 或 "bsc-testnet"
  })
);
```

### Python

```python
from x402 import create_payment_requirements

requirements = create_payment_requirements(
    network="bsc",  # 或 "bsc-testnet"
    pay_to="0xYourAddress",
    amount="1000000",  # USDC 金额（6位小数）
    resource="/your-endpoint"
)
```

## 配置说明

1. **RPC 端点**: 确保你的应用配置了 BSC 的 RPC 端点
   - BSC 主网: `https://bsc-dataseed.binance.org/`
   - BSC 测试网: `https://data-seed-prebsc-1-s1.binance.org:8545/`

2. **USDC 合约地址**: 
   - BSC 主网 USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`
   - BSC 测试网 USDC: 需要部署测试代币或使用现有测试代币

3. **Gas 费用**: BSC 使用 BNB 作为 gas 代币，确保facilitator钱包有足够的 BNB

## 注意事项

- BSC 的区块确认时间约为 3 秒
- 建议在测试网充分测试后再部署到主网
- 确保使用的 USDC 合约支持 EIP-3009 标准
