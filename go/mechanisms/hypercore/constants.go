package hypercore

import "time"

const (
	TxHashMaxRetries     = 2
	TxHashRetryDelay     = 500 * time.Millisecond
	TxHashLookbackWindow = 5000 * time.Millisecond
)
