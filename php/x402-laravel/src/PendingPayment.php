<?php

declare(strict_types=1);

namespace X402\Laravel;

use Stringable;

class PendingPayment implements Stringable
{
    private ?string $payTo = null;
    private ?string $network = null;
    private ?string $description = null;

    public function __construct(
        private readonly string $price,
    ) {
    }

    public static function make(string $price): self
    {
        return new self($price);
    }

    public function payTo(string $address): self
    {
        $this->payTo = $address;

        return $this;
    }

    public function network(string $network): self
    {
        $this->network = $network;

        return $this;
    }

    public function description(string $description): self
    {
        $this->description = $description;

        return $this;
    }

    /**
     * @return array{price: string, pay_to?: string, network?: string, description?: string}
     */
    public function toArray(): array
    {
        $options = ['price' => $this->price];

        if ($this->payTo !== null) {
            $options['pay_to'] = $this->payTo;
        }

        if ($this->network !== null) {
            $options['network'] = $this->network;
        }

        if ($this->description !== null) {
            $options['description'] = $this->description;
        }

        return $options;
    }

    public function __toString(): string
    {
        return $this->toArray()
            |> (fn($data): string => json_encode($data, JSON_THROW_ON_ERROR))
            |> base64_encode(...)
            |> (fn($encoded): string => RequirePayment::class . ':' . $encoded);
    }
}
