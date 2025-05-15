# Scheme: `upto`

## Summary

`upto` is a scheme that allows a resource server to specify a maximum amount of funds that the requested resource can cost. The client needs to permit the resource server to charge up to that amount. The resource server can then charge the client for the actual cost of the resource, which may be less than or equal to the maximum amount specified.

## Use Cases

Paying for a resource based on the size of the result (e.g., number of tokens generated) or any other resource where the exact cost is not known in advance but is capped at a maximum amount.

## Appendix
