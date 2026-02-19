package erc20approvalgassponsor

import (
	"encoding/json"
	"fmt"
	"regexp"
)

// ExtractErc20ApprovalGasSponsoringInfo extracts the ERC-20 approval gas sponsoring info
// from a payment payload's extensions map.
//
// Returns the info if the extension is present and contains the required
// client-populated fields, or nil if not present or incomplete.
func ExtractErc20ApprovalGasSponsoringInfo(extensions map[string]interface{}) (*Info, error) {
	if extensions == nil {
		return nil, nil
	}

	extRaw, ok := extensions[ERC20ApprovalGasSponsoring]
	if !ok {
		return nil, nil
	}

	// Marshal and unmarshal to get the extension structure
	extJSON, err := json.Marshal(extRaw)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal erc20ApprovalGasSponsoring extension: %w", err)
	}

	var ext Extension
	if err := json.Unmarshal(extJSON, &ext); err != nil {
		return nil, fmt.Errorf("failed to unmarshal erc20ApprovalGasSponsoring extension: %w", err)
	}

	// Marshal and unmarshal info to get the typed struct
	infoJSON, err := json.Marshal(ext.Info)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal erc20ApprovalGasSponsoring info: %w", err)
	}

	var info Info
	if err := json.Unmarshal(infoJSON, &info); err != nil {
		return nil, fmt.Errorf("failed to unmarshal erc20ApprovalGasSponsoring info: %w", err)
	}

	// Check that the client has populated the required fields
	if info.From == "" || info.Asset == "" || info.Spender == "" ||
		info.Amount == "" || info.SignedTransaction == "" || info.Version == "" {
		return nil, nil
	}

	return &info, nil
}

// ExtractErc20ApprovalGasSponsoringInfoFromPayloadBytes extracts the ERC-20 approval
// gas sponsoring info from raw payment payload JSON bytes.
func ExtractErc20ApprovalGasSponsoringInfoFromPayloadBytes(payloadBytes []byte) (*Info, error) {
	var payload struct {
		Extensions map[string]interface{} `json:"extensions"`
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	return ExtractErc20ApprovalGasSponsoringInfo(payload.Extensions)
}

var (
	erc20AddressPattern = regexp.MustCompile(`^0x[a-fA-F0-9]{40}$`)
	erc20NumericPattern = regexp.MustCompile(`^[0-9]+$`)
	erc20HexPattern     = regexp.MustCompile(`^0x[a-fA-F0-9]+$`)
	erc20VersionPattern = regexp.MustCompile(`^[0-9]+(\.[0-9]+)*$`)
)

// ValidateErc20ApprovalGasSponsoringInfo validates that the ERC-20 approval gas sponsoring
// info has valid format for all fields.
func ValidateErc20ApprovalGasSponsoringInfo(info *Info) bool {
	return erc20AddressPattern.MatchString(info.From) &&
		erc20AddressPattern.MatchString(info.Asset) &&
		erc20AddressPattern.MatchString(info.Spender) &&
		erc20NumericPattern.MatchString(info.Amount) &&
		erc20HexPattern.MatchString(info.SignedTransaction) &&
		erc20VersionPattern.MatchString(info.Version)
}
