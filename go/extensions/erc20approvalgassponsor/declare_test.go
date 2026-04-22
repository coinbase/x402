package erc20approvalgassponsor

import (
	"testing"
)

// TestDeclareExtension verifies DeclareExtension returns the correct top-level structure.
func TestDeclareExtension(t *testing.T) {
	result := DeclareExtension()

	// Must have exactly one key matching the extension identifier.
	if len(result) != 1 {
		t.Fatalf("expected 1 key in DeclareExtension map, got %d", len(result))
	}

	key := ERC20ApprovalGasSponsoring.Key()
	extRaw, ok := result[key]
	if !ok {
		t.Fatalf("expected key %q in DeclareExtension map", key)
	}

	ext, ok := extRaw.(Extension)
	if !ok {
		t.Fatalf("expected value to be Extension, got %T", extRaw)
	}

	// Info must be a ServerInfo with Description and Version populated.
	serverInfo, ok := ext.Info.(ServerInfo)
	if !ok {
		t.Fatalf("expected Info to be ServerInfo, got %T", ext.Info)
	}
	if serverInfo.Description == "" {
		t.Error("ServerInfo.Description must not be empty")
	}
	if serverInfo.Version != ERC20ApprovalGasSponsoringVersion {
		t.Errorf("ServerInfo.Version = %q, want %q", serverInfo.Version, ERC20ApprovalGasSponsoringVersion)
	}

	// Schema must be non-nil.
	if ext.Schema == nil {
		t.Error("Extension.Schema must not be nil")
	}
}

// TestErc20ApprovalGasSponsoringSchema verifies the JSON Schema returned by
// erc20ApprovalGasSponsoringSchema contains the expected required fields and structure.
func TestErc20ApprovalGasSponsoringSchema(t *testing.T) {
	schema := erc20ApprovalGasSponsoringSchema()

	if schema == nil {
		t.Fatal("erc20ApprovalGasSponsoringSchema returned nil")
	}

	// Top-level $schema and type.
	if v, ok := schema["$schema"].(string); !ok || v == "" {
		t.Error("schema must have a non-empty $schema string")
	}
	if v, ok := schema["type"].(string); !ok || v != "object" {
		t.Errorf("schema type must be %q, got %v", "object", schema["type"])
	}

	// properties must be present.
	props, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatalf("schema must have a 'properties' map, got %T", schema["properties"])
	}

	expectedFields := []string{"from", "asset", "spender", "amount", "signedTransaction", "version"}
	for _, field := range expectedFields {
		if _, ok := props[field]; !ok {
			t.Errorf("schema properties must include field %q", field)
		}
	}

	// required must list the same fields.
	requiredRaw, ok := schema["required"]
	if !ok {
		t.Fatal("schema must have a 'required' field")
	}
	required, ok := requiredRaw.([]string)
	if !ok {
		t.Fatalf("schema 'required' must be []string, got %T", requiredRaw)
	}
	requiredSet := make(map[string]bool, len(required))
	for _, r := range required {
		requiredSet[r] = true
	}
	for _, field := range expectedFields {
		if !requiredSet[field] {
			t.Errorf("schema 'required' must include %q", field)
		}
	}

	// Each property must have a non-empty "type".
	for _, field := range expectedFields {
		propMap, ok := props[field].(map[string]interface{})
		if !ok {
			t.Errorf("property %q must be a map, got %T", field, props[field])
			continue
		}
		if v, ok := propMap["type"].(string); !ok || v == "" {
			t.Errorf("property %q must have a non-empty 'type' string", field)
		}
	}
}

// TestErc20ApprovalFacilitatorExtension_Key verifies Key() returns the correct identifier.
func TestErc20ApprovalFacilitatorExtension_Key(t *testing.T) {
	ext := &Erc20ApprovalFacilitatorExtension{}
	got := ext.Key()
	want := ERC20ApprovalGasSponsoring.Key()
	if got != want {
		t.Errorf("Key() = %q, want %q", got, want)
	}
}
