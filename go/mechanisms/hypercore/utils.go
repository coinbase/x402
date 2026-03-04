package hypercore

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
	"time"
)

func FormatAmount(amount string, decimals int) (string, error) {
	amountInt, err := strconv.ParseInt(amount, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}

	amountFloat := float64(amountInt) / math.Pow10(decimals)
	return fmt.Sprintf("%.*f", decimals, amountFloat), nil
}

func ParseAmount(amount string, decimals int) (string, error) {
	cleaned := strings.TrimSpace(strings.TrimPrefix(amount, "$"))

	amountFloat, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}

	if amountFloat < 0 {
		return "", fmt.Errorf("amount cannot be negative: %s", amount)
	}

	amountInt := int64(math.Floor(amountFloat * math.Pow10(decimals)))
	return strconv.FormatInt(amountInt, 10), nil
}

// Nonce is expected to be in milliseconds (timestamp * 1000).
func IsNonceFresh(nonce int64, maxAge time.Duration) bool {
	nowMs := time.Now().UnixMilli()
	ageMs := nowMs - nonce
	ageSeconds := float64(ageMs) / 1000.0
	return ageSeconds >= 0 && ageSeconds <= maxAge.Seconds()
}

func NormalizeAddress(address string) string {
	return strings.ToLower(address)
}

func ParseAmountToInteger(amount string, decimals int) (*big.Int, error) {
	amountFloat, err := strconv.ParseFloat(amount, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid amount: %w", err)
	}

	amountInt := int64(math.Floor(amountFloat * math.Pow10(decimals)))
	return big.NewInt(amountInt), nil
}
