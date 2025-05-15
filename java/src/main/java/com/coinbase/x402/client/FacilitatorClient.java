package com.coinbase.x402.client;

import com.coinbase.x402.model.PaymentRequirements;

import java.io.IOException;
import java.util.Set;

/** Contract for calling an x402 facilitator (HTTP, gRPC, mock, etc.). */
public interface FacilitatorClient {
    VerificationResponse verify(String paymentHeader,
                                PaymentRequirements req)
            throws IOException, InterruptedException;

    SettlementResponse settle(String paymentHeader,
                              PaymentRequirements req)
            throws IOException, InterruptedException;

    Set<Kind> supported() throws IOException, InterruptedException;
}
