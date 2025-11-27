<?php

declare(strict_types=1);

namespace X402\Value;

use Brick\Math\BigDecimal;
use JsonSerializable;

readonly class Amount implements JsonSerializable, \Stringable
{
    public function __construct(
        public string $value,
        public int $decimals = 6,
    ) {
    }

    public static function fromDecimal(float|string $amount, int $decimals = 6): self
    {
        $atomic = $amount
            |> strval(...)
            |> (fn($s): string => str_starts_with($s, '$') ? substr($s, 1) : $s)
            |> BigDecimal::of(...)
            |> (fn($bd): BigDecimal => $bd->multipliedBy(BigDecimal::of(10)->power($decimals)))
            |> (fn($bd): string => (string) $bd->toBigInteger());

        return new self($atomic, $decimals);
    }

    public function toDecimal(): string
    {
        return $this->value
            |> BigDecimal::of(...)
            |> (fn($bd): BigDecimal => $bd->dividedBy(BigDecimal::of(10)->power($this->decimals), $this->decimals))
            |> strval(...);
    }

    public function jsonSerialize(): string
    {
        return $this->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
