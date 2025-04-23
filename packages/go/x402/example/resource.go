package main

import (
	"math/big"

	x402gin "github.com/coinbase/x402/pkg/x402/gin"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.GET(
		"/joke",
		x402gin.PaymentMiddleware(
			big.NewFloat(0.0001),
			"0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
			x402gin.WithFacilitatorURL("https://x402.org/facilitator"),
			x402gin.WithResource("http://localhost:4021/joke"),
			x402gin.WithDescription("Wanna see what’s behind the curtain?"),
		),
		func(c *gin.Context) {
			c.JSON(200, gin.H{
				"joke": "Why do programmers prefer dark mode? Because light attracts bugs!",
			})
		},
	)

	r.Run(":4021") // Start the server on 0.0.0.0:4021 (for windows "localhost:4021")
}
