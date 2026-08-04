FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY . .
RUN go build -o relay relay.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/relay .

CMD ["./relay"]
