# Express Middleware TODO

## Reference Implementation Status

Express serves as the **reference implementation** for x402 HTTP middleware. All other middleware implementations (Hono, Next.js, etc.) should use this as their canonical reference during the development of v2.

## Development Process

1. **Pilot Features Here First**: All SDK improvements and new features during v2 development will be implemented in Express first
2. **Mirror to Other Packages**: Once validated in Express, changes should be propagated to:
   - Hono middleware
   - Next.js middleware
   - Any future middleware implementations

## Responsibilities as Reference Implementation

- Maintain clear, well-documented code that serves as an example
- Establish patterns and conventions for other middleware to follow
- Test edge cases and error handling comprehensively
- Provide migration guides when breaking changes occur

## Notes for Other Implementations

When implementing Hono, Next.js, or other middleware packages:
1. Review the Express implementation first
2. Match the API surface as closely as the framework allows
3. Ensure feature parity with Express
4. Document any framework-specific deviations with justification

# TODO

- Auto-register evm exact and svm exact, depending on those packages
- Expose hooks once added to x402HTTPResourceServer
