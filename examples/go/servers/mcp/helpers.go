package main

import (
	"crypto/rand"
	"math/big"
)

// cryptoRandInt generates a cryptographically secure random integer in [0, max)
func cryptoRandInt(max int) int {
	if max <= 0 {
		return 0
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0 // fallback
	}
	return int(n.Int64())
}

// getWeatherData simulates fetching weather data for a city
func getWeatherData(city string) map[string]interface{} {
	conditions := []string{"sunny", "cloudy", "rainy", "snowy", "windy"}
	weather := conditions[cryptoRandInt(len(conditions))]
	temperature := cryptoRandInt(40) + 40
	return map[string]interface{}{
		"city":        city,
		"weather":     weather,
		"temperature": temperature,
	}
}
