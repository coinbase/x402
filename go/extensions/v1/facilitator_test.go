package v1

import (
	"testing"

	"github.com/x402-foundation/x402/go/extensions/types"
)

// makeV1Requirements builds a map[string]interface{} with an "outputSchema" containing the
// given input fields. It is the minimal shape ExtractDiscoveryInfoV1 expects.
func makeV1Requirements(method string, extraFields map[string]interface{}) map[string]interface{} {
	input := map[string]interface{}{
		"type":   "http",
		"method": method,
	}
	for k, v := range extraFields {
		input[k] = v
	}
	return map[string]interface{}{
		"outputSchema": map[string]interface{}{
			"input": input,
		},
	}
}

// ---------------------------------------------------------------------------
// ExtractDiscoveryInfoV1
// ---------------------------------------------------------------------------

func TestExtractDiscoveryInfoV1_NilRequirements(t *testing.T) {
	info, err := ExtractDiscoveryInfoV1(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil info for nil input, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_MissingOutputSchema(t *testing.T) {
	req := map[string]interface{}{"resource": "https://example.com"}
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil info when outputSchema missing, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_MissingInput(t *testing.T) {
	req := map[string]interface{}{
		"outputSchema": map[string]interface{}{
			"output": map[string]interface{}{"type": "object"},
		},
	}
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil when input field missing, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_WrongInputType(t *testing.T) {
	// type != "http"
	req := makeV1Requirements("GET", map[string]interface{}{"type": "grpc"})
	// Override type after makeV1Requirements already sets "type" field
	req["outputSchema"].(map[string]interface{})["input"].(map[string]interface{})["type"] = "grpc"
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil for non-http type, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_MissingMethod(t *testing.T) {
	req := map[string]interface{}{
		"outputSchema": map[string]interface{}{
			"input": map[string]interface{}{
				"type": "http",
				// no method
			},
		},
	}
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil when method missing, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_NotDiscoverable(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{"discoverable": false})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil when discoverable=false, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_GETWithQueryParams(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"queryParams": map[string]interface{}{"query": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for GET with queryParams")
	}
	qInput, ok := info.Input.(types.QueryInput)
	if !ok {
		t.Fatalf("expected QueryInput, got %T", info.Input)
	}
	if qInput.Method != "GET" {
		t.Errorf("expected method GET, got %s", qInput.Method)
	}
	if len(qInput.QueryParams) == 0 {
		t.Error("expected queryParams to be extracted")
	}
}

func TestExtractDiscoveryInfoV1_GETLowercase(t *testing.T) {
	// Method should be upper-cased internally
	req := makeV1Requirements("get", map[string]interface{}{})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for lowercase get")
	}
	qInput, ok := info.Input.(types.QueryInput)
	if !ok {
		t.Fatalf("expected QueryInput, got %T", info.Input)
	}
	if qInput.Method != "GET" {
		t.Errorf("expected method GET, got %s", qInput.Method)
	}
}

func TestExtractDiscoveryInfoV1_HEADMethod(t *testing.T) {
	req := makeV1Requirements("HEAD", nil)
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for HEAD")
	}
	if _, ok := info.Input.(types.QueryInput); !ok {
		t.Fatalf("expected QueryInput for HEAD, got %T", info.Input)
	}
}

func TestExtractDiscoveryInfoV1_DELETEMethod(t *testing.T) {
	req := makeV1Requirements("DELETE", nil)
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for DELETE")
	}
	if _, ok := info.Input.(types.QueryInput); !ok {
		t.Fatalf("expected QueryInput for DELETE, got %T", info.Input)
	}
}

func TestExtractDiscoveryInfoV1_POSTWithBody(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"bodyFields": map[string]interface{}{"text": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for POST with body")
	}
	bInput, ok := info.Input.(types.BodyInput)
	if !ok {
		t.Fatalf("expected BodyInput for POST, got %T", info.Input)
	}
	if bInput.Method != "POST" {
		t.Errorf("expected method POST, got %s", bInput.Method)
	}
}

func TestExtractDiscoveryInfoV1_PUTMethod(t *testing.T) {
	req := makeV1Requirements("PUT", map[string]interface{}{
		"body": map[string]interface{}{"id": "number"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for PUT")
	}
	if _, ok := info.Input.(types.BodyInput); !ok {
		t.Fatalf("expected BodyInput for PUT, got %T", info.Input)
	}
}

func TestExtractDiscoveryInfoV1_PATCHMethod(t *testing.T) {
	req := makeV1Requirements("PATCH", nil)
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for PATCH")
	}
	if _, ok := info.Input.(types.BodyInput); !ok {
		t.Fatalf("expected BodyInput for PATCH, got %T", info.Input)
	}
}

func TestExtractDiscoveryInfoV1_UnsupportedMethod(t *testing.T) {
	req := makeV1Requirements("OPTIONS", nil)
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil for unsupported method OPTIONS, got %+v", info)
	}
}

func TestExtractDiscoveryInfoV1_WithOutput(t *testing.T) {
	req := makeV1Requirements("GET", nil)
	req["outputSchema"].(map[string]interface{})["output"] = map[string]interface{}{"type": "object"}
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	if info.Output == nil {
		t.Error("expected Output to be non-nil when output schema present")
	}
}

func TestExtractDiscoveryInfoV1_WithHeadersCamelCase(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"headerFields": map[string]interface{}{"X-Custom": map[string]interface{}{"type": "string"}},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	qInput, ok := info.Input.(types.QueryInput)
	if !ok {
		t.Fatalf("expected QueryInput, got %T", info.Input)
	}
	if _, has := qInput.Headers["X-Custom"]; !has {
		t.Error("expected X-Custom header to be extracted")
	}
}

func TestExtractDiscoveryInfoV1_WithHeadersSnakeCase(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"header_fields": map[string]interface{}{"Authorization": map[string]interface{}{}},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_WithHeadersMap(t *testing.T) {
	// "headers" as string-valued map
	req := makeV1Requirements("GET", map[string]interface{}{
		"headers": map[string]interface{}{"Authorization": "Bearer token"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	qInput := info.Input.(types.QueryInput)
	if qInput.Headers["Authorization"] != "Bearer token" {
		t.Errorf("expected Authorization header value, got %q", qInput.Headers["Authorization"])
	}
}

func TestExtractDiscoveryInfoV1_SnakeCaseQueryParams(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"query_params": map[string]interface{}{"q": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	qInput := info.Input.(types.QueryInput)
	if len(qInput.QueryParams) == 0 {
		t.Error("expected query_params to be extracted via snake_case key")
	}
}

func TestExtractDiscoveryInfoV1_QueryKeyAlias(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"query": map[string]interface{}{"search": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_ParamsKeyAlias(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{
		"params": map[string]interface{}{"page": "number"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_BodySnakeCaseFields(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"body_fields": map[string]interface{}{"message": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_BodyParams(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"bodyParams": map[string]interface{}{"key": "val"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_DataBodyField(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"data": map[string]interface{}{"payload": "bytes"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_PropertiesBodyField(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"properties": map[string]interface{}{"name": "string"},
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
}

func TestExtractDiscoveryInfoV1_BodyTypeForm(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"bodyType": "multipart/form-data",
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	bInput := info.Input.(types.BodyInput)
	if bInput.BodyType != types.BodyTypeFormData {
		t.Errorf("expected BodyTypeFormData, got %q", bInput.BodyType)
	}
}

func TestExtractDiscoveryInfoV1_BodyTypePlainText(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"body_type": "text/plain",
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	bInput := info.Input.(types.BodyInput)
	if bInput.BodyType != types.BodyTypeText {
		t.Errorf("expected BodyTypeText, got %q", bInput.BodyType)
	}
}

func TestExtractDiscoveryInfoV1_BodyTypeJSON(t *testing.T) {
	req := makeV1Requirements("POST", map[string]interface{}{
		"bodyType": "application/json",
	})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}
	bInput := info.Input.(types.BodyInput)
	if bInput.BodyType != types.BodyTypeJSON {
		t.Errorf("expected BodyTypeJSON, got %q", bInput.BodyType)
	}
}

func TestExtractDiscoveryInfoV1_StructInput(t *testing.T) {
	// Pass a serializable struct instead of a plain map to exercise the JSON marshal path
	type customReq struct {
		OutputSchema map[string]interface{} `json:"outputSchema"`
	}
	req := customReq{
		OutputSchema: map[string]interface{}{
			"input": map[string]interface{}{
				"type":   "http",
				"method": "GET",
			},
		},
	}
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info for struct input")
	}
}

func TestExtractDiscoveryInfoV1_DiscoverableTrue(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{"discoverable": true})
	info, err := ExtractDiscoveryInfoV1(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info when discoverable=true")
	}
}

// ---------------------------------------------------------------------------
// IsDiscoverableV1
// ---------------------------------------------------------------------------

func TestIsDiscoverableV1_TrueForValidGET(t *testing.T) {
	req := makeV1Requirements("GET", nil)
	if !IsDiscoverableV1(req) {
		t.Error("expected IsDiscoverableV1=true for valid GET requirements")
	}
}

func TestIsDiscoverableV1_FalseWhenNotDiscoverable(t *testing.T) {
	req := makeV1Requirements("GET", map[string]interface{}{"discoverable": false})
	if IsDiscoverableV1(req) {
		t.Error("expected IsDiscoverableV1=false when discoverable=false")
	}
}

func TestIsDiscoverableV1_FalseForNil(t *testing.T) {
	if IsDiscoverableV1(nil) {
		t.Error("expected IsDiscoverableV1=false for nil input")
	}
}

func TestIsDiscoverableV1_FalseForEmptyMap(t *testing.T) {
	if IsDiscoverableV1(map[string]interface{}{}) {
		t.Error("expected IsDiscoverableV1=false for empty map")
	}
}

// ---------------------------------------------------------------------------
// ExtractResourceMetadataV1
// ---------------------------------------------------------------------------

func TestExtractResourceMetadataV1_FullFields(t *testing.T) {
	req := map[string]interface{}{
		"resource":    "https://api.example.com/v1/search",
		"description": "Search API",
		"mimeType":    "application/json",
	}
	meta := ExtractResourceMetadataV1(req)
	if meta["url"] != "https://api.example.com/v1/search" {
		t.Errorf("unexpected url: %q", meta["url"])
	}
	if meta["description"] != "Search API" {
		t.Errorf("unexpected description: %q", meta["description"])
	}
	if meta["mimeType"] != "application/json" {
		t.Errorf("unexpected mimeType: %q", meta["mimeType"])
	}
}

func TestExtractResourceMetadataV1_EmptyMap(t *testing.T) {
	meta := ExtractResourceMetadataV1(map[string]interface{}{})
	if len(meta) != 0 {
		t.Errorf("expected empty map, got %v", meta)
	}
}

func TestExtractResourceMetadataV1_OnlyURL(t *testing.T) {
	req := map[string]interface{}{"resource": "https://example.com/endpoint"}
	meta := ExtractResourceMetadataV1(req)
	if meta["url"] != "https://example.com/endpoint" {
		t.Errorf("unexpected url: %q", meta["url"])
	}
	if _, has := meta["description"]; has {
		t.Error("expected no description key when absent")
	}
}

func TestExtractResourceMetadataV1_StructInput(t *testing.T) {
	type customReq struct {
		Resource    string `json:"resource"`
		Description string `json:"description"`
	}
	req := customReq{Resource: "https://api.test.com", Description: "Test"}
	meta := ExtractResourceMetadataV1(req)
	if meta["url"] != "https://api.test.com" {
		t.Errorf("unexpected url: %q", meta["url"])
	}
	if meta["description"] != "Test" {
		t.Errorf("unexpected description: %q", meta["description"])
	}
}
