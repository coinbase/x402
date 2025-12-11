# x402-MCP Enhancement Plan

## 1. Fix Current UX Issues
- [ ] Convert OTP input in SignIn.tsx to text input for paste support
- [x] Add logout button functionality to Wallet.tsx using CDP hooks

## 2. Discovery List Tool
### MCP Layer
- [x] Add discovery_list tool registration in mcp.ts
  - Added tool registration with JSON response
  - Implemented operations.discoveryList handler
- [ ] Define discovery metadata schema
  - Need to document the DiscoveryListResponse and BazaarItem types
  - Need to specify format for Claude instructions

### Electron Layer
- [x] Add discovery operations handler in electron.ts
  - Added discoveryList operation
  - Added type imports
- [x] Implement IPC bridge for discovery metadata
  - Added OnDiscoveryList to preload.ts
  - Updated ElectronWindow interface
  - Created discovery.ts with facilitator integration

### Frontend
- [x] Create DiscoveryModal.tsx component
  - Added modal with item list display
  - Implemented loading and error states
  - Added copy functionality
- [x] Add discovery button to Wallet.tsx
  - Added button with modal integration
  - Maintained existing wallet functionality
- [x] Implement CDP hooks for discovery metadata
  - Using getDiscoveryList from discovery.ts
- [x] Add copy helper for Claude instructions
  - Added copy button for item data

## 3. HTTP Request with Payment Tool
### Setup
- [x] Create Viem ToAccount wrapper for cdp-core
- [x] Implement x402 client integration
- [x] Define payment flow types and interfaces

### Implementation
- [ ] Add http_request_with_payment tool to mcp.ts
- [ ] Create RequestHandler.ts for payment processing
- [ ] Integrate with policy engine checks
- [ ] Add payment request UI components

## 4. Policy Engine + Signature Modal
### Core Components
- [ ] Create PolicyStore.ts using Zustand
- [ ] Implement policy rule validation logic
- [ ] Create PolicyModal.tsx for configuration
- [ ] Create SignatureConfirmModal.tsx for manual approvals

### Integration
- [ ] Inject policy checks into signMessage flow (ipc.ts)
- [ ] Add policy configuration UI to Wallet.tsx
- [ ] Implement auto-signing rules for EIP-3009 USDC

## 5. Call Functionality
### Core
- [ ] Add general purpose signing operations
- [ ] Extend policy engine for call validation
- [ ] Implement transaction preview logic

### UI
- [ ] Create CallModal.tsx for transaction preview
- [ ] Integrate with existing signature flow
- [ ] Add call history tracking

## 6. CDP/Coinbase Branding
- [ ] Add @coinbase/design-system dependency
- [ ] Create theme.ts for consistent styling
- [ ] Apply branding to all modals and components
- [ ] Implement responsive design
- [ ] Add loading states and error handling

## Notes
- Implementation order should follow the numbered sections
- Each feature should include tests and documentation
- Policy engine should be extensible for future rule types
- All UI components should follow Coinbase design guidelines
