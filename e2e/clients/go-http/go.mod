module github.com/coinbase/x402-go/e2e/clients/go-http

go 1.23.0

toolchain go1.24.1

require (
	github.com/coinbase/x402-go/v2 v2.0.0
	github.com/ethereum/go-ethereum v1.14.11
)

require (
	github.com/bits-and-blooms/bitset v1.13.0 // indirect
	github.com/btcsuite/btcd/btcec/v2 v2.3.4 // indirect
	github.com/consensys/bavard v0.1.13 // indirect
	github.com/consensys/gnark-crypto v0.12.1 // indirect
	github.com/crate-crypto/go-ipa v0.0.0-20240223125850-b1e8a79f509c // indirect
	github.com/crate-crypto/go-kzg-4844 v1.0.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.0.1 // indirect
	github.com/ethereum/c-kzg-4844 v1.0.0 // indirect
	github.com/ethereum/go-verkle v0.1.1-0.20240829091221-dffa7562dbe9 // indirect
	github.com/holiman/uint256 v1.3.1 // indirect
	github.com/mmcloughlin/addchain v0.4.0 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/supranational/blst v0.3.13 // indirect
	golang.org/x/crypto v0.40.0 // indirect
	golang.org/x/sync v0.16.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	rsc.io/tmplfunc v0.0.3 // indirect
)

replace github.com/coinbase/x402-go/v2 => ../../../go
