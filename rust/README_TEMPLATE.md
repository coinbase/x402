# x402 Rust HTML Template System

## 概述

为Rust x402实现创建了一个现代化的HTML模板系统，类似于其他语言实现（Python、TypeScript）的模式，但使用Rust的类型系统提供更好的类型安全性。

## 架构

### 模块结构
```
rust/src/template/
├── mod.rs              # 主模板模块
├── paywall.rs          # HTML模板定义
├── config.rs           # 配置工具函数
└── paywall.html        # 静态HTML模板文件
```

### 核心组件

#### 1. PaywallConfig
```rust
pub struct PaywallConfig {
    pub app_name: Option<String>,
    pub app_logo: Option<String>,
    pub cdp_client_key: Option<String>,
    pub session_token_endpoint: Option<String>,
}
```

#### 2. 模板生成函数
```rust
pub fn generate_paywall_html(
    error: &str,
    payment_requirements: &[PaymentRequirements],
    paywall_config: Option<&PaywallConfig>,
) -> String
```

## 特性

### ✅ 现代化设计
- 响应式布局，支持移动端
- 渐变背景和现代化UI
- 清晰的视觉层次结构

### ✅ 配置注入
- 通过`window.x402`全局变量注入配置
- 支持应用品牌定制（名称、Logo）
- 支持CDP客户端集成

### ✅ 智能显示
- 根据支付金额显示详细信息
- 自动检测测试网并提供水龙头链接
- 错误消息显示
- 支付说明和指导

### ✅ 类型安全
- 使用Rust强类型系统
- 编译时错误检查
- 配置验证

## 使用示例

### 基本使用
```rust
use x402::template::{self, PaywallConfig};

let payment_requirements = PaymentRequirements {
    scheme: "exact".to_string(),
    network: "base-sepolia".to_string(),
    max_amount_required: "1000000".to_string(), // 1 USDC
    // ... 其他字段
};

let config = PaywallConfig::new()
    .with_app_name("My App")
    .with_app_logo("🚀");

let html = template::generate_paywall_html(
    "Please provide payment to access this resource",
    &[payment_requirements],
    Some(&config),
);
```

### 中间件集成
```rust
// 在middleware.rs中自动使用
let html = if let Some(custom_html) = &config.custom_paywall_html {
    custom_html.clone()
} else {
    // 使用新的模板系统
    let paywall_config = PaywallConfig::new()
        .with_app_name("x402 Service")
        .with_app_logo("💰");
    
    template::generate_paywall_html(
        "X-PAYMENT header is required",
        &[payment_requirements.clone()],
        Some(&paywall_config),
    )
};
```

## 与其他语言实现的对比

### 相似性
- **配置注入**：类似Python的`inject_payment_data`函数
- **静态模板**：类似Python的`static/paywall.html`
- **JavaScript集成**：类似TypeScript的`window.x402`全局变量

### 优势
- **类型安全**：编译时检查，减少运行时错误
- **性能**：使用`include_str!`宏，零运行时开销
- **模块化**：清晰的模块分离，易于维护
- **配置构建器**：链式API，易于使用

## 运行示例

```bash
cd rust
cargo run --example template_demo
```

这将生成三种不同的HTML模板：
1. **基本配置**：显示应用名称和Logo
2. **品牌配置**：包含CDP客户端密钥
3. **错误配置**：显示错误消息

## 自定义

### 添加新的配置选项
1. 在`PaywallConfig`结构体中添加字段
2. 在`PaywallConfigBuilder`中添加相应方法
3. 在`create_x402_config`函数中处理新字段
4. 在HTML模板中使用新配置

### 修改样式
编辑`src/template/paywall.html`中的CSS样式，或创建新的模板文件。

## 未来改进

- [ ] 支持多语言模板
- [ ] 添加更多主题选项
- [ ] 支持自定义CSS类
- [ ] 添加动画效果
- [ ] 支持暗色主题

## 总结

这个HTML模板系统为Rust x402实现提供了：
- 现代化的用户界面
- 类型安全的配置系统
- 与其他语言实现的一致性
- 易于定制和扩展的架构

它成功地将Python和TypeScript实现的最佳实践带到了Rust生态系统中，同时保持了Rust的类型安全和性能优势。
