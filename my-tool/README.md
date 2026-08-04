# my-tool

An ERC-8257 compliant AI agent tool deployed on Vercel.

## Setup

```bash
npm install
```

## Development

```bash
npx vercel dev
```

## Deploy

```bash
npx vercel
```

## Register onchain

```bash
npx @opensea/tool-sdk verify http://localhost:8700/.well-known/ai-tool/my-tool.json
npx @opensea/tool-sdk register --metadata http://localhost:8700/.well-known/ai-tool/my-tool.json --network base
```
