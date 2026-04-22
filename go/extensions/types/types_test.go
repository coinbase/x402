package types

import (
	"encoding/json"
	"testing"
)

// ---------------------------------------------------------------------------
// IsQueryMethod
// ---------------------------------------------------------------------------

func TestIsQueryMethod_GET(t *testing.T) {
	if !IsQueryMethod("GET") {
		t.Error("expected GET to be a query method")
	}
}

func TestIsQueryMethod_HEAD(t *testing.T) {
	if !IsQueryMethod("HEAD") {
		t.Error("expected HEAD to be a query method")
	}
}

func TestIsQueryMethod_DELETE(t *testing.T) {
	if !IsQueryMethod("DELETE") {
		t.Error("expected DELETE to be a query method")
	}
}

func TestIsQueryMethod_POST(t *testing.T) {
	if IsQueryMethod("POST") {
		t.Error("expected POST to NOT be a query method")
	}
}

func TestIsQueryMethod_PUT(t *testing.T) {
	if IsQueryMethod("PUT") {
		t.Error("expected PUT to NOT be a query method")
	}
}

func TestIsQueryMethod_PATCH(t *testing.T) {
	if IsQueryMethod("PATCH") {
		t.Error("expected PATCH to NOT be a query method")
	}
}

func TestIsQueryMethod_Lowercase(t *testing.T) {
	if IsQueryMethod("get") {
		t.Error("expected lowercase 'get' to NOT be a query method (case-sensitive)")
	}
}

func TestIsQueryMethod_Empty(t *testing.T) {
	if IsQueryMethod("") {
		t.Error("expected empty string to NOT be a query method")
	}
}

func TestIsQueryMethod_Unknown(t *testing.T) {
	if IsQueryMethod("OPTIONS") {
		t.Error("expected OPTIONS to NOT be a query method")
	}
}

// ---------------------------------------------------------------------------
// IsBodyMethod
// ---------------------------------------------------------------------------

func TestIsBodyMethod_POST(t *testing.T) {
	if !IsBodyMethod("POST") {
		t.Error("expected POST to be a body method")
	}
}

func TestIsBodyMethod_PUT(t *testing.T) {
	if !IsBodyMethod("PUT") {
		t.Error("expected PUT to be a body method")
	}
}

func TestIsBodyMethod_PATCH(t *testing.T) {
	if !IsBodyMethod("PATCH") {
		t.Error("expected PATCH to be a body method")
	}
}

func TestIsBodyMethod_GET(t *testing.T) {
	if IsBodyMethod("GET") {
		t.Error("expected GET to NOT be a body method")
	}
}

func TestIsBodyMethod_HEAD(t *testing.T) {
	if IsBodyMethod("HEAD") {
		t.Error("expected HEAD to NOT be a body method")
	}
}

func TestIsBodyMethod_DELETE(t *testing.T) {
	if IsBodyMethod("DELETE") {
		t.Error("expected DELETE to NOT be a body method")
	}
}

func TestIsBodyMethod_Lowercase(t *testing.T) {
	if IsBodyMethod("post") {
		t.Error("expected lowercase 'post' to NOT be a body method (case-sensitive)")
	}
}

func TestIsBodyMethod_Empty(t *testing.T) {
	if IsBodyMethod("") {
		t.Error("expected empty string to NOT be a body method")
	}
}

func TestIsBodyMethod_Unknown(t *testing.T) {
	if IsBodyMethod("CONNECT") {
		t.Error("expected CONNECT to NOT be a body method")
	}
}

// ---------------------------------------------------------------------------
// Mutual exclusivity: no method should be both query and body
// ---------------------------------------------------------------------------

func TestMethodMutualExclusivity(t *testing.T) {
	methods := []string{"GET", "HEAD", "DELETE", "POST", "PUT", "PATCH"}
	for _, m := range methods {
		q := IsQueryMethod(m)
		b := IsBodyMethod(m)
		if q && b {
			t.Errorf("method %q is both query and body — should be mutually exclusive", m)
		}
	}
}

// ---------------------------------------------------------------------------
// DiscoveryInfo UnmarshalJSON
// ---------------------------------------------------------------------------

func TestDiscoveryInfo_UnmarshalJSON_QueryInput(t *testing.T) {
	raw := `{
		"input": {
			"type": "http",
			"method": "GET",
			"queryParams": {"q": "string"}
		}
	}`
	var d DiscoveryInfo
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	qi, ok := d.Input.(QueryInput)
	if !ok {
		t.Fatalf("expected QueryInput, got %T", d.Input)
	}
	if qi.Method != MethodGET {
		t.Errorf("expected method GET, got %q", qi.Method)
	}
}

func TestDiscoveryInfo_UnmarshalJSON_BodyInput(t *testing.T) {
	raw := `{
		"input": {
			"type": "http",
			"method": "POST",
			"bodyType": "json",
			"body": {"key": "value"}
		}
	}`
	var d DiscoveryInfo
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	bi, ok := d.Input.(BodyInput)
	if !ok {
		t.Fatalf("expected BodyInput, got %T", d.Input)
	}
	if bi.Method != MethodPOST {
		t.Errorf("expected method POST, got %q", bi.Method)
	}
	if bi.BodyType != BodyTypeJSON {
		t.Errorf("expected bodyType json, got %q", bi.BodyType)
	}
}

func TestDiscoveryInfo_UnmarshalJSON_WithOutput(t *testing.T) {
	raw := `{
		"input": {
			"type": "http",
			"method": "GET"
		},
		"output": {
			"type": "json",
			"format": "application/json"
		}
	}`
	var d DiscoveryInfo
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Output == nil {
		t.Fatal("expected Output to be populated")
	}
	if d.Output.Type != "json" {
		t.Errorf("expected output type 'json', got %q", d.Output.Type)
	}
}

func TestDiscoveryInfo_UnmarshalJSON_InvalidJSON(t *testing.T) {
	var d DiscoveryInfo
	if err := json.Unmarshal([]byte(`not json`), &d); err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}
