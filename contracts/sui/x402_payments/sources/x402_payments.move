/// X402 Payments Contract
/// A simple contract for processing x402 payments with exact amount
/// verification
module x402_payments::payments;

use sui::coin::{Self, Coin};
use sui::event;

/// Error codes
const EInvalidAmount: u64 = 0;

/// Event emitted when a payment is made
public struct PaymentMade<phantom T> has copy, drop {
    amount: u64,
    recipient: address,
    invoice_id: vector<u8>,
}

/// Make a payment with exact amount verification
/// @param payment_coin The coin to use for payment
/// @param expected_amount The exact amount expected (must match coin value)
/// @param recipient The address to send the payment to
/// @param invoice_id An opaque identifier for the payment/invoice
public fun make_payment<T>(
    payment_coin: Coin<T>,
    expected_amount: u64,
    recipient: address,
    invoice_id: vector<u8>,
) {
    // Verify the coin has exactly the expected amount
    let coin_value = coin::value(&payment_coin);
    assert!(coin_value == expected_amount, EInvalidAmount);

    // Emit payment event
    event::emit(PaymentMade<T> {
        amount: expected_amount,
        recipient,
        invoice_id,
    });

    // Transfer the coin to the recipient
    transfer::public_transfer(payment_coin, recipient);
}

/// Get the module version (for debugging/verification)
public fun version(): u64 {
    1
}

#[test_only]
use sui::sui::SUI;
#[test_only]
use sui::test_scenario;

#[test_only]
const ALICE: address = @0xA;
#[test_only]
const BOB: address = @0xB;

#[test]
fun test_make_payment_success() {
    let mut scenario = test_scenario::begin(ALICE);

    // Create a coin with 1000 units
    let coin = coin::mint_for_testing<SUI>(1000, scenario.ctx());
    let invoice_id = b"invoice_123";

    // Make payment with exact amount
    make_payment(
        coin,
        1000, // expected amount matches coin value
        BOB, // recipient
        invoice_id,
    );

    scenario.end();
}

#[test]
#[expected_failure(abort_code = EInvalidAmount)]
fun test_make_payment_wrong_amount() {
    let mut scenario = test_scenario::begin(ALICE);

    // Create a coin with 1000 units
    let coin = coin::mint_for_testing<SUI>(1000, scenario.ctx());
    let invoice_id = b"invoice_123";

    // Try to make payment with wrong expected amount
    make_payment(
        coin,
        500, // expected amount doesn't match coin value (1000)
        BOB,
        invoice_id,
    );

    scenario.end();
}

#[test]
fun test_make_payment_zero_amount() {
    let mut scenario = test_scenario::begin(ALICE);

    // Create a coin with 0 units
    let coin = coin::mint_for_testing<SUI>(0, scenario.ctx());
    let invoice_id = b"invoice_zero";

    // Make payment with zero amount
    make_payment(
        coin,
        0, // expected amount matches coin value
        BOB,
        invoice_id,
    );

    scenario.end();
}

#[test]
fun test_version() {
    assert!(version() == 1, 0);
}

#[test]
fun test_make_payment_empty_invoice_id() {
    let mut scenario = test_scenario::begin(ALICE);

    // Create a coin with 500 units
    let coin = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let invoice_id = b""; // empty invoice ID

    // Make payment with empty invoice ID (should work)
    make_payment(
        coin,
        500,
        BOB,
        invoice_id,
    );

    scenario.end();
}
