package x402

import (
	"context"
	"time"
)

// ============================================================================
// Facilitator Hook Context Types
// ============================================================================

// FacilitatorVerifyContext contains information passed to facilitator verify hooks
type FacilitatorVerifyContext struct {
	Ctx               context.Context
	PaymentPayload    PaymentPayload
	PaymentRequirements PaymentRequirements
	Timestamp         time.Time
	RequestMetadata   map[string]interface{}
}

// FacilitatorVerifyResultContext contains facilitator verify operation result and context
type FacilitatorVerifyResultContext struct {
	FacilitatorVerifyContext
	Result   VerifyResponse
	Duration time.Duration
}

// FacilitatorVerifyFailureContext contains facilitator verify operation failure and context
type FacilitatorVerifyFailureContext struct {
	FacilitatorVerifyContext
	Error    error
	Duration time.Duration
}

// FacilitatorSettleContext contains information passed to facilitator settle hooks
type FacilitatorSettleContext struct {
	Ctx               context.Context
	PaymentPayload    PaymentPayload
	PaymentRequirements PaymentRequirements
	Timestamp         time.Time
	RequestMetadata   map[string]interface{}
}

// FacilitatorSettleResultContext contains facilitator settle operation result and context
type FacilitatorSettleResultContext struct {
	FacilitatorSettleContext
	Result   SettleResponse
	Duration time.Duration
}

// FacilitatorSettleFailureContext contains facilitator settle operation failure and context
type FacilitatorSettleFailureContext struct {
	FacilitatorSettleContext
	Error    error
	Duration time.Duration
}

// ============================================================================
// Facilitator Hook Result Types
// ============================================================================

// FacilitatorBeforeHookResult represents the result of a facilitator "before" hook
// If Abort is true, the operation will be aborted with the given Reason
type FacilitatorBeforeHookResult struct {
	Abort  bool
	Reason string
}

// FacilitatorVerifyFailureHookResult represents the result of a facilitator verify failure hook
// If Recovered is true, the hook has recovered from the failure with the given result
type FacilitatorVerifyFailureHookResult struct {
	Recovered bool
	Result    VerifyResponse
}

// FacilitatorSettleFailureHookResult represents the result of a facilitator settle failure hook
type FacilitatorSettleFailureHookResult struct {
	Recovered bool
	Result    SettleResponse
}

// ============================================================================
// Facilitator Hook Function Types
// ============================================================================

// FacilitatorBeforeVerifyHook is called before facilitator payment verification
// If it returns a result with Abort=true, verification will be skipped
// and an invalid VerifyResponse will be returned with the provided reason
type FacilitatorBeforeVerifyHook func(FacilitatorVerifyContext) (*FacilitatorBeforeHookResult, error)

// FacilitatorAfterVerifyHook is called after successful facilitator payment verification
// Any error returned will be logged but will not affect the verification result
type FacilitatorAfterVerifyHook func(FacilitatorVerifyResultContext) error

// FacilitatorOnVerifyFailureHook is called when facilitator payment verification fails
// If it returns a result with Recovered=true, the provided VerifyResponse
// will be returned instead of the error
type FacilitatorOnVerifyFailureHook func(FacilitatorVerifyFailureContext) (*FacilitatorVerifyFailureHookResult, error)

// FacilitatorBeforeSettleHook is called before facilitator payment settlement
// If it returns a result with Abort=true, settlement will be aborted
// and an error will be returned with the provided reason
type FacilitatorBeforeSettleHook func(FacilitatorSettleContext) (*FacilitatorBeforeHookResult, error)

// FacilitatorAfterSettleHook is called after successful facilitator payment settlement
// Any error returned will be logged but will not affect the settlement result
type FacilitatorAfterSettleHook func(FacilitatorSettleResultContext) error

// FacilitatorOnSettleFailureHook is called when facilitator payment settlement fails
// If it returns a result with Recovered=true, the provided SettleResponse
// will be returned instead of the error
type FacilitatorOnSettleFailureHook func(FacilitatorSettleFailureContext) (*FacilitatorSettleFailureHookResult, error)

