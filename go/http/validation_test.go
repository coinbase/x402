package http

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestValidateAndDecodePaymentHeader(t *testing.T) {
	t.Run("Empty/Invalid Base64", func(t *testing.T) {
		tests := []struct {
			name          string
			header        string
			expectedError string
		}{
			{
				name:          "empty string",
				header:        "",
				expectedError: "payment header is empty",
			},
			{
				name:          "invalid base64 characters",
				header:        "invalid@#$%",
				expectedError: "invalid payment header format: not valid base64",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				_, err := ValidateAndDecodePaymentHeader(tt.header)
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if err.Error() != tt.expectedError {
					t.Errorf("expected error %q, got %q", tt.expectedError, err.Error())
				}
			})
		}
	})

	t.Run("Valid Base64 but Invalid JSON", func(t *testing.T) {
		tests := []struct {
			name          string
			content       string
			expectedError string
		}{
			{
				name:    "non-JSON content",
				content: "not json at all",
			},
			{
				name:    "malformed JSON",
				content: "{invalid json}",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				encoded := base64.StdEncoding.EncodeToString([]byte(tt.content))
				_, err := ValidateAndDecodePaymentHeader(encoded)
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				// Should contain "not valid JSON"
				if err.Error()[:len("invalid payment header format: not valid JSON")] != "invalid payment header format: not valid JSON" {
					t.Errorf("expected JSON error, got %q", err.Error())
				}
			})
		}
	})

	t.Run("Missing Required Fields", func(t *testing.T) {
		tests := []struct {
			name          string
			payload       map[string]interface{}
			expectedError string
		}{
			{
				name: "missing x402Version",
				payload: map[string]interface{}{
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "missing required field: x402Version",
			},
			{
				name: "missing resource",
				payload: map[string]interface{}{
					"x402Version": 1,
					"accepted":    map[string]interface{}{},
					"payload":     map[string]interface{}{},
				},
				expectedError: "missing required field: resource",
			},
			{
				name: "missing resource.url",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "missing required field: resource.url",
			},
			{
				name: "missing resource.description",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":      "http://test.com",
						"mimeType": "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "missing required field: resource.description",
			},
			{
				name: "missing resource.mimeType",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "missing required field: resource.mimeType",
			},
			{
				name: "missing accepted",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"payload": map[string]interface{}{},
				},
				expectedError: "missing required field: accepted",
			},
			{
				name: "missing payload",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
				},
				expectedError: "missing required field: payload",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				jsonBytes, _ := json.Marshal(tt.payload)
				encoded := base64.StdEncoding.EncodeToString(jsonBytes)
				_, err := ValidateAndDecodePaymentHeader(encoded)
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if err.Error() != tt.expectedError {
					t.Errorf("expected error %q, got %q", tt.expectedError, err.Error())
				}
			})
		}
	})

	t.Run("Invalid Field Types", func(t *testing.T) {
		tests := []struct {
			name          string
			payload       map[string]interface{}
			expectedError string
		}{
			{
				name: "x402Version as string",
				payload: map[string]interface{}{
					"x402Version": "1",
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "invalid field type: x402Version must be a number",
			},
			{
				name: "resource as string",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource":    "not an object",
					"accepted":    map[string]interface{}{},
					"payload":     map[string]interface{}{},
				},
				expectedError: "invalid field type: resource must be an object",
			},
			{
				name: "resource.url as number",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         123,
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "invalid field type: resource.url must be a string",
			},
			{
				name: "accepted as array",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": []interface{}{},
					"payload":  map[string]interface{}{},
				},
				expectedError: "invalid field type: accepted must be an object",
			},
			{
				name: "payload as string",
				payload: map[string]interface{}{
					"x402Version": 1,
					"resource": map[string]interface{}{
						"url":         "http://test.com",
						"description": "Test",
						"mimeType":    "application/json",
					},
					"accepted": map[string]interface{}{},
					"payload":  "not an object",
				},
				expectedError: "invalid field type: payload must be an object",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				jsonBytes, _ := json.Marshal(tt.payload)
				encoded := base64.StdEncoding.EncodeToString(jsonBytes)
				_, err := ValidateAndDecodePaymentHeader(encoded)
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if err.Error() != tt.expectedError {
					t.Errorf("expected error %q, got %q", tt.expectedError, err.Error())
				}
			})
		}
	})

	t.Run("Valid Payload", func(t *testing.T) {
		payload := map[string]interface{}{
			"x402Version": 2,
			"resource": map[string]interface{}{
				"url":         "http://test.com/api",
				"description": "Test API",
				"mimeType":    "application/json",
			},
			"accepted": map[string]interface{}{
				"scheme":            "exact",
				"network":           "eip155:84532",
				"asset":             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
				"amount":            "10000",
				"payTo":             "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
				"maxTimeoutSeconds": 60,
			},
			"payload": map[string]interface{}{
				"signature": "0x123...",
			},
		}

		jsonBytes, _ := json.Marshal(payload)
		encoded := base64.StdEncoding.EncodeToString(jsonBytes)
		decoded, err := ValidateAndDecodePaymentHeader(encoded)

		if err != nil {
			t.Errorf("expected no error but got: %v", err)
			return
		}

		if decoded == nil {
			t.Errorf("expected decoded payload but got nil")
			return
		}

		if decoded.X402Version != 2 {
			t.Errorf("expected x402Version 2, got %d", decoded.X402Version)
		}

		if decoded.Resource.URL != "http://test.com/api" {
			t.Errorf("expected resource.url http://test.com/api, got %s", decoded.Resource.URL)
		}
	})
}
