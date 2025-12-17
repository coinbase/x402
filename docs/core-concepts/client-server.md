# Client / Server

This page explains the roles and responsibilities of the **client** and **server** in the x402 protocol.

Understanding these roles is essential to designing, building, or integrating services that use x402 for programmatic payments.

**Note**\
Client refers to the technical component making an HTTP request. In practice, this is often the _buyer_ of the resource.

Server refers to the technical component responding to the request. In practice, this is typically the _seller_ of the resource

### Client Role

The client is the entity that initiates a request to access a paid resource.

Clients can include:

* Human-operated applications
* Autonomous agents
* Programmatic services acting on behalf of users or systems

#### Responsibilities

* **Initiate requests:** Send an HTTP request to the resource server.
* **Handle payment requirements:** Read the `402 Payment Required` response and extract payment details.
* **Prepare payment payload:** Use the provided payment requirements to construct a valid payment payload.
* **Resubmit request with payment:** Retry the request with the `X-PAYMENT` header containing the signed payment payload.

Clients do not need to manage accounts, credentials, or session tokens beyond their crypto wallet. All interactions are stateless and occur over standard HTTP requests.

### Server Role

The server is the resource provider enforcing payment for access to its services.

Servers can include:

* API services
* Content providers
* Any HTTP-accessible resource requiring monetization

#### Responsibilities

* **Define payment requirements:** Respond to unauthenticated requests with an HTTP `402 Payment Required`, including all necessary payment details in the response body.
* **Verify payment payloads:** Validate incoming payment payloads, either locally or by using a facilitator service.
* **Settle transactions:** Upon successful verification, submit the payment for settlement.
* **Provide the resource:** Once payment is confirmed, return the requested resource to the client.

Servers do not need to manage client identities or maintain session state. Verification and settlement are handled per request.

### Communication Flow

The typical flow between a client and a server in the x402 protocol is as follows:

1. **Client initiates request** to the server for a paid resource.
2. **Server responds with `402 Payment Required`**, including the payment requirements in the response body.
3. **Client prepares and submits a payment payload** based on the provided requirements, including it in the `PAYMENT-SIGNATURE` header (Base64-encoded).
4. **Server verifies the payment payload**, either locally or through a facilitator service.
5. **Server settles the payment** and confirms transaction completion.
6. **Server responds with the requested resource**, including a `PAYMENT-RESPONSE` header (Base64-encoded) with settlement confirmation, assuming payment was successful.

### Summary

In the x402 protocol:

* The **client** requests resources and supplies the signed payment payload.
* The **server** enforces payment requirements, verifies transactions, and provides the resource upon successful payment.

This interaction is stateless, HTTP-native, and compatible with both human applications and automated agents.

Next, explore:

* [Facilitator](facilitator.md) — how servers verify and settle payments
* [HTTP 402](http-402.md) — how servers communicate payment requirements to clients
