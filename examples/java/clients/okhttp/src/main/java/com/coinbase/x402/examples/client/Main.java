package com.coinbase.x402.examples.client;

import com.coinbase.x402.client.X402HttpClient;
import com.coinbase.x402.crypto.CryptoSigner;
import io.github.cdimascio.dotenv.Dotenv;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

import java.io.IOException;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/**
 * Example demonstrating x402 payment integration with OkHttp.
 * 
 * This example shows how to:
 * 1. Load configuration from environment variables
 * 2. Create an x402 client with Ethereum signing capabilities
 * 3. Make HTTP requests with automatic payment handling
 */
public class Main {
    
    private static final String DEFAULT_RESOURCE_SERVER_URL = "https://echo.x402.org";
    private static final String DEFAULT_ENDPOINT_PATH = "/echo";
    
    public static void main(String[] args) {
        try {
            // Load environment variables
            Dotenv dotenv = Dotenv.configure()
                .ignoreIfMissing()
                .load();
            
            // Validate and extract configuration
            Config config = loadConfiguration(dotenv);
            
            // Create x402 client with Ethereum signer
            X402HttpClient x402Client = createX402Client(config);
            
            // Make a request with payment
            makePaymentRequest(x402Client, config);
            
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
    
    private static Config loadConfiguration(Dotenv dotenv) {
        String evmPrivateKey = dotenv.get("EVM_PRIVATE_KEY");
        String resourceServerUrl = dotenv.get("RESOURCE_SERVER_URL", DEFAULT_RESOURCE_SERVER_URL);
        String endpointPath = dotenv.get("ENDPOINT_PATH", DEFAULT_ENDPOINT_PATH);
        
        if (evmPrivateKey == null || evmPrivateKey.isEmpty()) {
            throw new IllegalStateException(
                "EVM_PRIVATE_KEY environment variable is required. " +
                "Please copy .env-local to .env and set your private key."
            );
        }
        
        return new Config(evmPrivateKey, resourceServerUrl, endpointPath);
    }
    
    private static X402HttpClient createX402Client(Config config) {
        // Create Ethereum credentials from private key
        Credentials credentials = Credentials.create(config.evmPrivateKey());
        System.out.println("Initialized EVM account: " + credentials.getAddress());
        
        // Create crypto signer using Web3j
        CryptoSigner signer = new Web3jSigner(credentials);
        
        // Create x402 HTTP client
        return new X402HttpClient(signer);
    }
    
    private static void makePaymentRequest(X402HttpClient client, Config config) throws Exception {
        String url = config.resourceServerUrl() + config.endpointPath();
        System.out.println("Making request to: " + url);
        
        // Make request with payment parameters
        // These would typically be determined by the server's 402 response
        BigInteger amount = BigInteger.valueOf(1000); // 1000 wei
        String asset = "USDC";
        String payTo = "0x1234567890123456789012345678901234567890"; // Example address
        
        try {
            HttpResponse<String> response = client.get(
                URI.create(url), 
                amount, 
                asset, 
                payTo
            );
            
            System.out.println("Response status: " + response.statusCode());
            System.out.println("Response body: " + response.body());
            
            if (response.statusCode() == 402) {
                System.out.println("\n402 Payment Required - payment challenge received");
            } else if (response.statusCode() == 200) {
                System.out.println("\n✅ Payment successful - received protected content");
            }
            
        } catch (Exception e) {
            System.err.println("Request failed: " + e.getMessage());
            throw e;
        }
    }
    
    /**
     * Configuration record for environment variables.
     */
    private record Config(
        String evmPrivateKey,
        String resourceServerUrl, 
        String endpointPath
    ) {}
    
    /**
     * Web3j-based implementation of CryptoSigner for Ethereum signatures.
     */
    private static class Web3jSigner implements CryptoSigner {
        private final Credentials credentials;
        
        public Web3jSigner(Credentials credentials) {
            this.credentials = credentials;
        }
        
        @Override
        public String sign(Map<String, Object> payload) {
            try {
                // Create message hash from payload
                // This is a simplified implementation - real implementation 
                // would follow EIP-712 structured data signing
                String message = payload.toString();
                byte[] messageHash = MessageDigest.getInstance("SHA-256")
                    .digest(message.getBytes(StandardCharsets.UTF_8));
                
                // Sign the message hash
                Sign.SignatureData signature = Sign.signMessage(
                    messageHash, 
                    credentials.getEcKeyPair(), 
                    false
                );
                
                // Return signature in hex format
                return Numeric.toHexString(signature.getR()) + 
                       Numeric.toHexString(signature.getS()).substring(2) + 
                       Numeric.toHexString(new byte[]{signature.getV()[0]}).substring(2);
                       
            } catch (Exception e) {
                throw new RuntimeException("Failed to sign payload", e);
            }
        }
    }
}