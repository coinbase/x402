package evm

// ERC-4337 contract addresses
const (
	// EntryPoint07Address is the canonical EntryPoint v0.7 address
	EntryPoint07Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"

	// Safe4337ModuleAddress is the Safe 4337 module address
	Safe4337ModuleAddress = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226"

	// SafeWebAuthnSharedSigner is the Safe WebAuthn shared signer address
	SafeWebAuthnSharedSigner = "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9"

	// FCLP256Verifier is the FCL P256 verifier address
	FCLP256Verifier = "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA"

	// P256OwnerFactory is the P256 owner factory address
	P256OwnerFactory = "0x349c03Eb61e26528cbf79F5D3Ba071FcA2aE82cB"

	// WebAuthnSignerFactory is the WebAuthn signer factory address
	WebAuthnSignerFactory = "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf"
)

// AAErrorMessages maps AA error codes to their human-readable messages.
var AAErrorMessages = map[string]string{
	"AA10": "Sender already constructed",
	"AA13": "InitCode failed or OOG",
	"AA14": "InitCode must return sender",
	"AA15": "InitCode must create sender",
	"AA20": "Account not deployed",
	"AA21": "Insufficient funds for gas prefund",
	"AA22": "Expired or not due",
	"AA23": "Reverted (or OOG)",
	"AA24": "Signature validation failed",
	"AA25": "Nonce validation failed",
	"AA26": "Account accessed global state",
	"AA30": "Paymaster not deployed",
	"AA31": "Paymaster deposit too low",
	"AA32": "Paymaster expired or not due",
	"AA33": "Paymaster reverted (or OOG)",
	"AA34": "Paymaster context reverted",
	"AA40": "Over verification gas limit",
	"AA41": "Over max fee per gas",
	"AA50": "Over max priority fee per gas",
	"AA51": "Prefund below actualGasCost",
}
