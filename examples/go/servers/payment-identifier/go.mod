module github.com/coinbase/x402/examples/go/servers/payment-identifier

go 1.24.0

toolchain go1.24.1

replace github.com/coinbase/x402/go => ../../../../go

require (
	github.com/coinbase/x402/go v0.0.0-00010101000000-000000000000
	github.com/gin-gonic/gin v1.11.0
	github.com/joho/godotenv v1.5.1
)
