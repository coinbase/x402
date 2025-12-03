<?php

declare(strict_types=1);

namespace X402\Payload;

use JsonSerializable;
use X402\Enum\Scheme;
use X402\Networks;
use X402\Value\Amount;
use X402\Value\Network;

readonly class PaymentRequirements implements JsonSerializable
{
    /**
     * @param array<string, mixed>|null $extra
     * @param array<string, mixed>|null $outputSchema
     */
    public function __construct(
        public Scheme $scheme,
        public Network $network,
        public Amount $maxAmountRequired,
        public string $resource,
        public string $payTo,
        public string $asset,
        public string $description = '',
        public string $mimeType = 'application/json',
        public int $maxTimeoutSeconds = 60,
        public ?array $extra = null,
        public ?array $outputSchema = null,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $data = [
            'scheme' => $this->scheme->value,
            'network' => $this->network->value,
            'maxAmountRequired' => $this->maxAmountRequired->value,
            'resource' => $this->resource,
            'description' => $this->description,
            'mimeType' => $this->mimeType,
            'payTo' => $this->payTo,
            'maxTimeoutSeconds' => $this->maxTimeoutSeconds,
            'asset' => $this->asset,
        ];

        if ($this->extra !== null) {
            $data['extra'] = $this->extra;
        }

        if ($this->outputSchema !== null) {
            $data['outputSchema'] = $this->outputSchema;
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
