package com.coinbase.x402.examples.server;

import com.coinbase.x402.client.HttpFacilitatorClient;
import com.coinbase.x402.server.PaymentFilter;
import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.DispatcherType;
import java.math.BigInteger;
import java.util.EnumSet;
import java.util.Map;

/**
 * Spring Boot application demonstrating x402 payment integration.
 * 
 * This example shows how to:
 * 1. Configure payment filtering for specific endpoints
 * 2. Define pricing for different resources
 * 3. Set up facilitator integration
 * 4. Create protected endpoints that require payment
 */
@SpringBootApplication
@RestController
public class X402SpringBootApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(X402SpringBootApplication.class, args);
        System.out.println("x402 Spring Boot server started!");
        System.out.println("Try accessing:");
        System.out.println("  http://localhost:8080/free - Free endpoint");
        System.out.println("  http://localhost:8080/premium - Paid endpoint (1000 wei)");
        System.out.println("  http://localhost:8080/exclusive - Paid endpoint (5000 wei)");
    }
    
    /**
     * Configure the x402 payment filter.
     */
    @Bean
    public FilterRegistrationBean<PaymentFilter> paymentFilter() {
        // Load configuration from environment
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        
        String facilitatorUrl = dotenv.get("FACILITATOR_URL", "https://x402.org/facilitator");
        String payToAddress = dotenv.get("PAY_TO_ADDRESS", "0x1234567890123456789012345678901234567890");
        
        System.out.println("Configuring payment filter:");
        System.out.println("  Facilitator: " + facilitatorUrl);
        System.out.println("  Pay-to address: " + payToAddress);
        
        // Define pricing table - which endpoints require payment and how much
        Map<String, BigInteger> priceTable = Map.of(
            "/premium", BigInteger.valueOf(1000),   // 1000 wei for premium content
            "/exclusive", BigInteger.valueOf(5000)  // 5000 wei for exclusive content
        );
        
        // Create facilitator client
        HttpFacilitatorClient facilitator = new HttpFacilitatorClient(facilitatorUrl);
        
        // Create payment filter
        PaymentFilter paymentFilter = new PaymentFilter(payToAddress, priceTable, facilitator);
        
        // Register the filter
        FilterRegistrationBean<PaymentFilter> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(paymentFilter);
        registrationBean.addUrlPatterns("/*");
        registrationBean.setDispatcherTypes(EnumSet.of(DispatcherType.REQUEST));
        registrationBean.setOrder(1); // High priority
        
        return registrationBean;
    }
    
    /**
     * Free endpoint - no payment required.
     */
    @GetMapping("/free")
    public Map<String, Object> getFreeContent() {
        return Map.of(
            "message", "This is free content!",
            "timestamp", System.currentTimeMillis(),
            "type", "free"
        );
    }
    
    /**
     * Premium endpoint - requires 1000 wei payment.
     */
    @GetMapping("/premium")
    public Map<String, Object> getPremiumContent() {
        // If this code runs, payment was verified by the filter
        return Map.of(
            "message", "Welcome to premium content! 🎉",
            "secret", "The answer to life, universe, and everything is 42",
            "timestamp", System.currentTimeMillis(),
            "type", "premium",
            "price", "1000 wei"
        );
    }
    
    /**
     * Exclusive endpoint - requires 5000 wei payment.
     */
    @GetMapping("/exclusive")
    public Map<String, Object> getExclusiveContent() {
        // If this code runs, payment was verified by the filter
        return Map.of(
            "message", "You've accessed the most exclusive content! ✨",
            "secret", "The real treasure was the friends we made along the way",
            "bonus", "Here's a bonus secret: x402 makes micropayments easy!",
            "timestamp", System.currentTimeMillis(),
            "type", "exclusive", 
            "price", "5000 wei"
        );
    }
    
    /**
     * Health check endpoint.
     */
    @GetMapping("/health")
    public Map<String, String> healthCheck() {
        return Map.of(
            "status", "healthy",
            "service", "x402-spring-boot-example"
        );
    }
}