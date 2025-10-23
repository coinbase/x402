# Fetch Client TODO

## Reference Implementation Status

Fetch serves as the **reference implementation** for x402 HTTP clients. All other client implementations (Axios, native HTTP clients, etc.) should use this as their canonical reference during the development of v2.

## Development Process

1. **Pilot Features Here First**: All client SDK improvements and new features during v2 development will be implemented in Fetch first
2. **Mirror to Other Packages**: Once validated in Fetch, changes should be propagated to:
   - Axios client
   - Native HTTP clients
   - Any future client implementations

## Responsibilities as Reference Implementation

- Maintain clear, well-documented code that serves as an example
- Establish patterns and conventions for other clients to follow
- Test edge cases and error handling comprehensively
- Provide migration guides when breaking changes occur
- Define standard client behaviors (retries, timeouts, error handling)

## Notes for Other Implementations

When implementing Axios or other client packages:
1. Review the Fetch implementation first
2. Match the API surface as closely as the library allows
3. Ensure feature parity with Fetch
4. Document any library-specific deviations with justification

# TODO
 
- Auto-register evm exact and svm exact, depending on those packages
- Add support for adding policies