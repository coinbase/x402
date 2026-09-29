package authcapture

import (
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"

	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
)

const (
	// SchemeAuthCapture is the scheme identifier for auth-capture payments.
	SchemeAuthCapture = "auth-capture"

	// AuthCaptureEscrowV1_0Address is the commerce-payments v1.0 AuthCaptureEscrow deployment.
	AuthCaptureEscrowV1_0Address = "0xBdEA0D1bcC5966192B070Fdf62aB4EF5b4420cff"

	// EIP3009TokenCollectorV1_0Address is the commerce-payments v1.0 EIP-3009 token collector.
	EIP3009TokenCollectorV1_0Address = "0x0E3dF9510de65469C4518D7843919c0b8C7A7757"

	// Permit2TokenCollectorV1_0Address is the commerce-payments v1.0 Permit2 token collector.
	Permit2TokenCollectorV1_0Address = "0x992476B9Ee81d52a5BdA0622C333938D0Af0aB26"

	// OperatorRefundCollectorV1_0Address is the commerce-payments v1.0 operator refund collector.
	OperatorRefundCollectorV1_0Address = "0x934907bffd0901b6A21e398B9C53A4A38F02fa5d"

	// AuthCaptureEscrowV1_1Address is the commerce-payments v1.1 AuthCaptureEscrow deployment (default).
	AuthCaptureEscrowV1_1Address = "0xf96815976523E00e65Be8f34cA5e64b4f41EB19c"

	// EIP3009TokenCollectorV1_1Address is the commerce-payments v1.1 EIP-3009 token collector.
	EIP3009TokenCollectorV1_1Address = "0x8612dfdc421f80336cd14E8EF9cb1E765dB5ab88"

	// Permit2TokenCollectorV1_1Address is the commerce-payments v1.1 Permit2 token collector.
	Permit2TokenCollectorV1_1Address = "0xD69831Aed5bfe262067ec4c751f4F830EcdD446e"

	// OperatorRefundCollectorV1_1Address is the commerce-payments v1.1 operator refund collector.
	OperatorRefundCollectorV1_1Address = "0x7a03443724d14798c4AB4622F1DAAcA761Fea486"

	// AuthCaptureEscrowAddress is the default AuthCaptureEscrow deployment (v1.1).
	AuthCaptureEscrowAddress = AuthCaptureEscrowV1_1Address

	// EIP3009TokenCollectorAddress is the default EIP-3009 token collector (v1.1).
	EIP3009TokenCollectorAddress = EIP3009TokenCollectorV1_1Address

	// Permit2TokenCollectorAddress is the default Permit2 token collector (v1.1).
	Permit2TokenCollectorAddress = Permit2TokenCollectorV1_1Address

	// OperatorRefundCollectorAddress is the default operator refund collector (v1.1).
	OperatorRefundCollectorAddress = OperatorRefundCollectorV1_1Address

	saltBindingTypeString = "x402AuthCaptureSaltBinding(address receiverAuthorizer,address policy,uint256 saltNonce)"

	paymentInfoTypeString = "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)"
)

// AuthCaptureDeploymentVersion identifies a commerce-payments deployment set.
type AuthCaptureDeploymentVersion string

const (
	AuthCaptureDeploymentV1_0 AuthCaptureDeploymentVersion = "v1.0"
	AuthCaptureDeploymentV1_1 AuthCaptureDeploymentVersion = "v1.1"
)

// AuthCaptureDeployment is a resolved commerce-payments deployment (escrow + collectors).
type AuthCaptureDeployment struct {
	Version                 AuthCaptureDeploymentVersion
	Escrow                  string
	EIP3009Collector        string
	Permit2Collector        string
	OperatorRefundCollector string
}

var (
	authCaptureDeploymentV1_0 = AuthCaptureDeployment{
		Version:                 AuthCaptureDeploymentV1_0,
		Escrow:                  AuthCaptureEscrowV1_0Address,
		EIP3009Collector:        EIP3009TokenCollectorV1_0Address,
		Permit2Collector:        Permit2TokenCollectorV1_0Address,
		OperatorRefundCollector: OperatorRefundCollectorV1_0Address,
	}

	authCaptureDeploymentV1_1 = AuthCaptureDeployment{
		Version:                 AuthCaptureDeploymentV1_1,
		Escrow:                  AuthCaptureEscrowV1_1Address,
		EIP3009Collector:        EIP3009TokenCollectorV1_1Address,
		Permit2Collector:        Permit2TokenCollectorV1_1Address,
		OperatorRefundCollector: OperatorRefundCollectorV1_1Address,
	}
)

// ResolveAuthCaptureDeployment selects the commerce-payments deployment from
// optional extra.authCaptureEscrow. Absent or the v1.1 escrow selects v1.1;
// the v1.0 escrow selects v1.0. Returns nil for unknown or invalid addresses.
func ResolveAuthCaptureDeployment(escrow string) *AuthCaptureDeployment {
	if escrow == "" {
		d := authCaptureDeploymentV1_1
		return &d
	}
	if !evm.IsValidAddress(escrow) {
		return nil
	}
	normalized := strings.ToLower(evm.NormalizeAddress(escrow))
	switch normalized {
	case strings.ToLower(AuthCaptureEscrowV1_1Address), strings.ToLower(AuthCaptureEscrowAddress):
		d := authCaptureDeploymentV1_1
		return &d
	case strings.ToLower(AuthCaptureEscrowV1_0Address):
		d := authCaptureDeploymentV1_0
		return &d
	default:
		return nil
	}
}

// SaltBindingTypeHash is keccak256(SALT_BINDING_TYPEHASH string).
var SaltBindingTypeHash = crypto.Keccak256Hash([]byte(saltBindingTypeString))

// PaymentInfoTypeHash is keccak256(PaymentInfo type string); must match AuthCaptureEscrow.PAYMENT_INFO_TYPEHASH.
var PaymentInfoTypeHash = crypto.Keccak256Hash([]byte(paymentInfoTypeString))

// ReceiveAuthorizationTypes defines EIP-712 types for ERC-3009 ReceiveWithAuthorization.
var ReceiveAuthorizationTypes = map[string][]evm.TypedDataField{
	"ReceiveWithAuthorization": {
		{Name: "from", Type: "address"},
		{Name: "to", Type: "address"},
		{Name: "value", Type: "uint256"},
		{Name: "validAfter", Type: "uint256"},
		{Name: "validBefore", Type: "uint256"},
		{Name: "nonce", Type: "bytes32"},
	},
}

// Permit2TransferFromTypes defines EIP-712 types for Permit2 PermitTransferFrom (no witness).
var Permit2TransferFromTypes = map[string][]evm.TypedDataField{
	"PermitTransferFrom": {
		{Name: "permitted", Type: "TokenPermissions"},
		{Name: "spender", Type: "address"},
		{Name: "nonce", Type: "uint256"},
		{Name: "deadline", Type: "uint256"},
	},
	"TokenPermissions": {
		{Name: "token", Type: "address"},
		{Name: "amount", Type: "uint256"},
	},
}

// GetReceiveAuthorizationEIP712Types returns the complete EIP-712 types map for ERC-3009 signing.
func GetReceiveAuthorizationEIP712Types() map[string][]evm.TypedDataField {
	return map[string][]evm.TypedDataField{
		"EIP712Domain": {
			{Name: "name", Type: "string"},
			{Name: "version", Type: "string"},
			{Name: "chainId", Type: "uint256"},
			{Name: "verifyingContract", Type: "address"},
		},
		"ReceiveWithAuthorization": ReceiveAuthorizationTypes["ReceiveWithAuthorization"],
	}
}

// GetPermit2TransferFromEIP712Types returns the complete EIP-712 types map for Permit2 PermitTransferFrom.
func GetPermit2TransferFromEIP712Types() map[string][]evm.TypedDataField {
	return map[string][]evm.TypedDataField{
		"EIP712Domain":       evm.EIP712DomainTypes,
		"PermitTransferFrom": Permit2TransferFromTypes["PermitTransferFrom"],
		"TokenPermissions":   Permit2TransferFromTypes["TokenPermissions"],
	}
}

// OperatorEIP712Domain is the shared partial EIP-712 domain for every
// facilitator-relayed lifecycle operation (Capture, Void, Charge, Refund).
// ChainID and VerifyingContract (the capture authorizer, PaymentInfo.operator)
// are filled in per call, not scheme-wide.
var OperatorEIP712Domain = evm.TypedDataDomain{
	Name:    "x402 Auth Capture Operator",
	Version: "1",
}

// CaptureTypesV1_1 defines EIP-712 types for the Capture operator signature on
// v1.1 deployments (absolute feeAmount).
var CaptureTypesV1_1 = map[string][]evm.TypedDataField{
	"Capture": {
		{Name: "paymentInfoHash", Type: "bytes32"},
		{Name: "amount", Type: "uint256"},
		{Name: "feeAmount", Type: "uint256"},
		{Name: "feeReceiver", Type: "address"},
		{Name: "expectedCapturableAmount", Type: "uint256"},
		{Name: "expectedRefundableAmount", Type: "uint256"},
	},
}

// CaptureTypesV1_0 defines EIP-712 types for the Capture operator signature on
// v1.0 deployments (feeBps).
var CaptureTypesV1_0 = map[string][]evm.TypedDataField{
	"Capture": {
		{Name: "paymentInfoHash", Type: "bytes32"},
		{Name: "amount", Type: "uint256"},
		{Name: "feeBps", Type: "uint16"},
		{Name: "feeReceiver", Type: "address"},
		{Name: "expectedCapturableAmount", Type: "uint256"},
		{Name: "expectedRefundableAmount", Type: "uint256"},
	},
}

// VoidTypes defines EIP-712 types for the Void operator signature (identical
// across v1.0 and v1.1 — void has no fee parameter).
var VoidTypes = map[string][]evm.TypedDataField{
	"Void": {
		{Name: "paymentInfoHash", Type: "bytes32"},
	},
}

// CaptureTypesForDeployment returns the Capture EIP-712 types matching the
// deployment's fee encoding (feeBps for v1.0, feeAmount for v1.1).
func CaptureTypesForDeployment(deployment *AuthCaptureDeployment) map[string][]evm.TypedDataField {
	if deployment != nil && deployment.Version == AuthCaptureDeploymentV1_0 {
		return CaptureTypesV1_0
	}
	return CaptureTypesV1_1
}

// FeeAmountFromBps computes the absolute fee for amount at feeBps, using the
// same truncating integer division as the AuthCaptureEscrow contract.
func FeeAmountFromBps(amount *big.Int, feeBps uint16) *big.Int {
	fee := new(big.Int).Mul(amount, big.NewInt(int64(feeBps)))
	return fee.Div(fee, big.NewInt(10000))
}

// paymentInfoTupleABI is the AuthCaptureEscrow.PaymentInfo tuple, shared by
// every function/event ABI fragment below.
const paymentInfoTupleABI = `{"name": "paymentInfo", "type": "tuple", "components": [
	{"name": "operator", "type": "address"},
	{"name": "payer", "type": "address"},
	{"name": "receiver", "type": "address"},
	{"name": "token", "type": "address"},
	{"name": "maxAmount", "type": "uint120"},
	{"name": "preApprovalExpiry", "type": "uint48"},
	{"name": "authorizationExpiry", "type": "uint48"},
	{"name": "refundExpiry", "type": "uint48"},
	{"name": "minFeeBps", "type": "uint16"},
	{"name": "maxFeeBps", "type": "uint16"},
	{"name": "feeReceiver", "type": "address"},
	{"name": "salt", "type": "uint256"}
]}`

// authorizeVoidPaymentStateABI is the version-independent portion of the
// escrow ABI: authorize (collect), void (finalize), and paymentState
// (balance read). None of these are called with an authorizer signature —
// authorize/void are gated on-chain by onlySender(paymentInfo.operator); the
// EIP-712 authorizer signature is a facilitator-side, off-chain consent check
// verified before the (plain) contract call is made, not a contract argument.
const authorizeVoidPaymentStateABI = `
	{
		"name": "authorize",
		"type": "function",
		"stateMutability": "nonpayable",
		"inputs": [
			` + paymentInfoTupleABI + `,
			{"name": "amount", "type": "uint256"},
			{"name": "tokenCollector", "type": "address"},
			{"name": "collectorData", "type": "bytes"}
		],
		"outputs": []
	},
	{
		"name": "void",
		"type": "function",
		"stateMutability": "nonpayable",
		"inputs": [
			` + paymentInfoTupleABI + `
		],
		"outputs": []
	},
	{
		"name": "paymentState",
		"type": "function",
		"stateMutability": "view",
		"inputs": [
			{"name": "paymentInfoHash", "type": "bytes32"}
		],
		"outputs": [
			{"name": "hasCollectedPayment", "type": "bool"},
			{"name": "capturableAmount", "type": "uint120"},
			{"name": "refundableAmount", "type": "uint120"}
		]
	},
	{
		"name": "PaymentAuthorized",
		"type": "event",
		"anonymous": false,
		"inputs": [
			{"name": "paymentInfoHash", "type": "bytes32", "indexed": true},
			` + paymentInfoTupleABI + `,
			{"name": "amount", "type": "uint256", "indexed": false},
			{"name": "tokenCollector", "type": "address", "indexed": false}
		]
	},
	{
		"name": "PaymentVoided",
		"type": "event",
		"anonymous": false,
		"inputs": [
			{"name": "paymentInfoHash", "type": "bytes32", "indexed": true},
			{"name": "amount", "type": "uint256", "indexed": false}
		]
	}
`

// AuthCaptureEscrowABIV1_1 is the AuthCaptureEscrow ABI for v1.1 deployments
// (absolute feeAmount on capture), covering the delegated-operator, EIP-3009,
// escrow-flow, sync-capture slice: authorize, capture, void, paymentState.
var AuthCaptureEscrowABIV1_1 = []byte(`[` + authorizeVoidPaymentStateABI + `,
	{
		"name": "capture",
		"type": "function",
		"stateMutability": "nonpayable",
		"inputs": [
			` + paymentInfoTupleABI + `,
			{"name": "amount", "type": "uint256"},
			{"name": "feeAmount", "type": "uint256"},
			{"name": "feeReceiver", "type": "address"}
		],
		"outputs": []
	},
	{
		"name": "PaymentCaptured",
		"type": "event",
		"anonymous": false,
		"inputs": [
			{"name": "paymentInfoHash", "type": "bytes32", "indexed": true},
			{"name": "amount", "type": "uint256", "indexed": false},
			{"name": "feeAmount", "type": "uint256", "indexed": false},
			{"name": "feeReceiver", "type": "address", "indexed": false}
		]
	}
]`)

// AuthCaptureEscrowABIV1_0 is the AuthCaptureEscrow ABI for v1.0 deployments
// (feeBps on capture).
var AuthCaptureEscrowABIV1_0 = []byte(`[` + authorizeVoidPaymentStateABI + `,
	{
		"name": "capture",
		"type": "function",
		"stateMutability": "nonpayable",
		"inputs": [
			` + paymentInfoTupleABI + `,
			{"name": "amount", "type": "uint256"},
			{"name": "feeBps", "type": "uint16"},
			{"name": "feeReceiver", "type": "address"}
		],
		"outputs": []
	},
	{
		"name": "PaymentCaptured",
		"type": "event",
		"anonymous": false,
		"inputs": [
			{"name": "paymentInfoHash", "type": "bytes32", "indexed": true},
			{"name": "amount", "type": "uint256", "indexed": false},
			{"name": "feeBps", "type": "uint16", "indexed": false},
			{"name": "feeReceiver", "type": "address", "indexed": false}
		]
	}
]`)

// EscrowABIForDeployment returns the AuthCaptureEscrow ABI matching the
// deployment's capture fee encoding (feeBps for v1.0, feeAmount for v1.1).
func EscrowABIForDeployment(deployment *AuthCaptureDeployment) []byte {
	if deployment != nil && deployment.Version == AuthCaptureDeploymentV1_0 {
		return AuthCaptureEscrowABIV1_0
	}
	return AuthCaptureEscrowABIV1_1
}
