<?php

declare(strict_types=1);

namespace X402\Laravel\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use X402\Laravel\Discovery;

class DiscoveryController
{
    public function __construct(
        private readonly Discovery $discovery,
    ) {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['nullable', 'string', 'in:http'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'offset' => ['nullable', 'integer', 'min:0'],
            'metadata' => ['nullable', 'array'],
            'metadata.*' => ['string'],
        ]);

        // Extract metadata filters (e.g., metadata[provider]=Coinbase)
        $metadataFilters = $validated['metadata'] ?? null;

        $response = $this->discovery
            ->discoverRoutes()
            ->resources(
                type: $validated['type'] ?? null,
                limit: (int) ($validated['limit'] ?? 20),
                offset: (int) ($validated['offset'] ?? 0),
                metadata: $metadataFilters,
            );

        return new JsonResponse($response->toArray());
    }
}
