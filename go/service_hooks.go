package x402

import (
	"context"
	"time"
)

// ============================================================================
// Resource Service Hook Context Types
// ============================================================================

// VerifyContext contains information passed to verify hooks
type VerifyContext struct {
	Ctx              context.Context
	PayloadBytes     []byte
	RequirementsBytes []byte
	Timestamp        time.Time
	RequestMetadata  map[string]interface{}
}

// VerifyResultContext contains verify operation result and context
type VerifyResultContext struct {
	VerifyContext
	Result   VerifyResponse
	Duration time.Duration
}

// VerifyFailureContext contains verify operation failure and context
type VerifyFailureContext struct {
	VerifyContext
	Error    error
	Duration time.Duration
}

// SettleContext contains information passed to settle hooks
type SettleContext struct {
	Ctx              context.Context
	PayloadBytes     []byte
	RequirementsBytes []byte
	Timestamp        time.Time
	RequestMetadata  map[string]interface{}
}

// SettleResultContext contains settle operation result and context
type SettleResultContext struct {
	SettleContext
	Result   SettleResponse
	Duration time.Duration
}

// SettleFailureContext contains settle operation failure and context
type SettleFailureContext struct {
	SettleContext
	Error    error
	Duration time.Duration
}

// ============================================================================
// Resource Service Hook Result Types
// ============================================================================

// BeforeHookResult represents the result of a "before" hook
// If Abort is true, the operation will be aborted with the given Reason
type BeforeHookResult struct {
	Abort  bool
	Reason string
}

// VerifyFailureHookResult represents the result of a verify failure hook
// If Recovered is true, the hook has recovered from the failure with the given result
type VerifyFailureHookResult struct {
	Recovered bool
	Result    VerifyResponse
}

// SettleFailureHookResult represents the result of a settle failure hook
type SettleFailureHookResult struct {
	Recovered bool
	Result    SettleResponse
}

// ============================================================================
// Resource Service Hook Function Types
// ============================================================================

// BeforeVerifyHook is called before payment verification
// If it returns a result with Abort=true, verification will be skipped
// and an invalid VerifyResponse will be returned with the provided reason
type BeforeVerifyHook func(VerifyContext) (*BeforeHookResult, error)

// AfterVerifyHook is called after successful payment verification
// Any error returned will be logged but will not affect the verification result
type AfterVerifyHook func(VerifyResultContext) error

// OnVerifyFailureHook is called when payment verification fails
// If it returns a result with Recovered=true, the provided VerifyResponse
// will be returned instead of the error
type OnVerifyFailureHook func(VerifyFailureContext) (*VerifyFailureHookResult, error)

// BeforeSettleHook is called before payment settlement
// If it returns a result with Abort=true, settlement will be aborted
// and an error will be returned with the provided reason
type BeforeSettleHook func(SettleContext) (*BeforeHookResult, error)

// AfterSettleHook is called after successful payment settlement
// Any error returned will be logged but will not affect the settlement result
type AfterSettleHook func(SettleResultContext) error

// OnSettleFailureHook is called when payment settlement fails
// If it returns a result with Recovered=true, the provided SettleResponse
// will be returned instead of the error
type OnSettleFailureHook func(SettleFailureContext) (*SettleFailureHookResult, error)

// ============================================================================
// Resource Service Hook Registration Options
// ============================================================================

// WithBeforeVerifyHook registers a hook to execute before payment verification
func WithBeforeVerifyHook(hook BeforeVerifyHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.beforeVerifyHooks = append(s.beforeVerifyHooks, hook)
	}
}

// WithAfterVerifyHook registers a hook to execute after successful payment verification
func WithAfterVerifyHook(hook AfterVerifyHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.afterVerifyHooks = append(s.afterVerifyHooks, hook)
	}
}

// WithOnVerifyFailureHook registers a hook to execute when payment verification fails
func WithOnVerifyFailureHook(hook OnVerifyFailureHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.onVerifyFailureHooks = append(s.onVerifyFailureHooks, hook)
	}
}

// WithBeforeSettleHook registers a hook to execute before payment settlement
func WithBeforeSettleHook(hook BeforeSettleHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.beforeSettleHooks = append(s.beforeSettleHooks, hook)
	}
}

// WithAfterSettleHook registers a hook to execute after successful payment settlement
func WithAfterSettleHook(hook AfterSettleHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.afterSettleHooks = append(s.afterSettleHooks, hook)
	}
}

// WithOnSettleFailureHook registers a hook to execute when payment settlement fails
func WithOnSettleFailureHook(hook OnSettleFailureHook) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.onSettleFailureHooks = append(s.onSettleFailureHooks, hook)
	}
}

