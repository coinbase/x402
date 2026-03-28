package com.coinbase.examples.proxysigner;

import com.coinbase.cdp.CdpClient;
import com.coinbase.cdp.openapi.ApiException;
import com.coinbase.cdp.openapi.model.EIP712Domain;
import com.coinbase.cdp.openapi.model.EIP712Message;
import com.coinbase.cdp.client.evm.EvmClientOptions;
import com.coinbase.cdp.client.solana.SolanaClientOptions;
import com.coinbase.cdp.openapi.model.ListEvmTokenBalancesNetwork;
import com.coinbase.cdp.openapi.model.ListSolanaTokenBalancesNetwork;
import com.coinbase.cdp.openapi.model.RequestEvmFaucetRequest;
import com.coinbase.cdp.openapi.model.RequestSolanaFaucetRequest;
import com.coinbase.cdp.openapi.model.SignSolanaTransactionRequest;
import io.javalin.Javalin;
import io.javalin.http.Context;

import java.math.BigInteger;
import java.util.List;
import java.util.Map;

/**
 * Minimal proxy server that exposes CDP SDK signing operations as HTTP endpoints.
 *
 * Clients (TypeScript, Python, etc.) implement x402 signer interfaces by
 * forwarding signing calls to this server instead of holding private keys locally.
 */
public class ProxySignerServer {

    private static final long MIN_USDC_BALANCE = 100000; // $0.10 (6 decimals)

    private final CdpClient cdp;
    private final String evmAddress;
    private final String solanaAddress;

    public ProxySignerServer() throws ApiException {
        this.cdp = CdpClient.create();

        var evmAccount = cdp.evm().getOrCreateAccount(
                com.coinbase.cdp.client.evm.EvmClientOptions.GetOrCreateAccountOptions.builder()
                        .name("x402-proxy-evm").build());
        this.evmAddress = evmAccount.getAddress();
        System.out.println("EVM account: " + evmAddress);

        var solanaAccount = cdp.solana().getOrCreateAccount(
                com.coinbase.cdp.client.solana.SolanaClientOptions.GetOrCreateAccountOptions.builder()
                        .name("x402-proxy-solana").build());
        this.solanaAddress = solanaAccount.getAddress();
        System.out.println("Solana account: " + solanaAddress);

        faucetIfNeeded();
    }

    /**
     * Check USDC balances on Base Sepolia and Solana Devnet.
     * Request faucet funds if either is below the minimum.
     */
    private void faucetIfNeeded() {
        faucetEvmIfNeeded();
        faucetSolanaIfNeeded();
    }

    private void faucetEvmIfNeeded() {
        try {
            var balances = cdp.evm().listTokenBalances(
                    EvmClientOptions.ListTokenBalancesOptions.builder()
                            .address(evmAddress)
                            .network(ListEvmTokenBalancesNetwork.BASE_SEPOLIA)
                            .build());

            boolean needsFunding = true;
            for (var tb : balances.getBalances()) {
                if ("USDC".equalsIgnoreCase(tb.getToken().getSymbol())) {
                    var balance = new BigInteger(tb.getAmount().getAmount());
                    System.out.println("EVM USDC balance: " + balance);
                    needsFunding = balance.compareTo(BigInteger.valueOf(MIN_USDC_BALANCE)) < 0;
                    break;
                }
            }

            if (needsFunding) {
                System.out.println("Requesting EVM USDC faucet (Base Sepolia)...");
                var resp = cdp.evm().requestFaucet(new RequestEvmFaucetRequest()
                        .address(evmAddress)
                        .network(RequestEvmFaucetRequest.NetworkEnum.BASE_SEPOLIA)
                        .token(RequestEvmFaucetRequest.TokenEnum.USDC));
                System.out.println("EVM faucet tx: " + resp.getTransactionHash());
            }
        } catch (Exception e) {
            System.out.println("EVM faucet check failed (non-fatal): " + e.getMessage());
        }
    }

    private void faucetSolanaIfNeeded() {
        try {
            var balances = cdp.solana().listTokenBalances(
                    SolanaClientOptions.ListTokenBalancesOptions.builder()
                            .address(solanaAddress)
                            .network(ListSolanaTokenBalancesNetwork.SOLANA_DEVNET)
                            .build());

            boolean needsFunding = true;
            for (var tb : balances.getBalances()) {
                if ("USDC".equalsIgnoreCase(tb.getToken().getSymbol())) {
                    var balance = new BigInteger(tb.getAmount().getAmount());
                    System.out.println("Solana USDC balance: " + balance);
                    needsFunding = balance.compareTo(BigInteger.valueOf(MIN_USDC_BALANCE)) < 0;
                    break;
                }
            }

            if (needsFunding) {
                System.out.println("Requesting Solana USDC faucet (Devnet)...");
                var resp = cdp.solana().requestFaucet(new RequestSolanaFaucetRequest()
                        .address(solanaAddress)
                        .token(RequestSolanaFaucetRequest.TokenEnum.USDC));
                System.out.println("Solana faucet tx: " + resp.getTransactionSignature());
            }
        } catch (Exception e) {
            System.out.println("Solana faucet check failed (non-fatal): " + e.getMessage());
        }
    }

    /** GET /evm/address */
    private void getEvmAddress(Context ctx) {
        ctx.json(Map.of("address", evmAddress));
    }

    /** POST /evm/sign-typed-data — proxies to cdp.evm().signTypedData() */
    @SuppressWarnings("unchecked")
    private void signTypedData(Context ctx) throws ApiException {
        var body = ctx.bodyAsClass(Map.class);

        Map<String, Object> domainMap = (Map<String, Object>) body.get("domain");
        EIP712Domain domain = new EIP712Domain()
                .name((String) domainMap.get("name"))
                .version((String) domainMap.get("version"))
                .chainId(((Number) domainMap.get("chainId")).longValue())
                .verifyingContract((String) domainMap.get("verifyingContract"));

        Map<String, Object> types = new java.util.HashMap<>((Map<String, Object>) body.get("types"));
        // CDP API requires EIP712Domain in types; viem/x402 omits it since it's implicit
        if (!types.containsKey("EIP712Domain")) {
            types.put("EIP712Domain", List.of(
                    Map.of("name", "name", "type", "string"),
                    Map.of("name", "version", "type", "string"),
                    Map.of("name", "chainId", "type", "uint256"),
                    Map.of("name", "verifyingContract", "type", "address")));
        }
        String primaryType = (String) body.get("primaryType");
        Map<String, Object> message = (Map<String, Object>) body.get("message");

        EIP712Message eip712Message = new EIP712Message()
                .domain(domain)
                .types(types)
                .primaryType(primaryType)
                .message(message);

        var response = cdp.evm().signTypedData(evmAddress, eip712Message);
        ctx.json(Map.of("signature", response.getSignature()));
    }

    /** GET /svm/address */
    private void getSvmAddress(Context ctx) {
        ctx.json(Map.of("address", solanaAddress));
    }

    /** POST /svm/partial-sign-transaction — proxies to cdp.solana().signTransaction() */
    @SuppressWarnings("unchecked")
    private void partialSignTransaction(Context ctx) throws ApiException {
        var body = ctx.bodyAsClass(Map.class);
        String transaction = (String) body.get("transaction");

        var response = cdp.solana().signTransaction(
                solanaAddress,
                new SignSolanaTransactionRequest().transaction(transaction));

        ctx.json(Map.of("signedTransaction", response.getSignedTransaction()));
    }

    public static void main(String[] args) throws ApiException {
        var server = new ProxySignerServer();

        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        var app = Javalin.create().start(port);

        app.get("/evm/address", server::getEvmAddress);
        app.post("/evm/sign-typed-data", server::signTypedData);
        app.get("/svm/address", server::getSvmAddress);
        app.post("/svm/partial-sign-transaction", server::partialSignTransaction);

        System.out.println("Proxy signer server running on http://localhost:" + port);
    }
}
