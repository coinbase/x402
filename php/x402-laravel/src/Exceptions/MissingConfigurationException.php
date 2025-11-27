<?php

declare(strict_types=1);

namespace X402\Laravel\Exceptions;

class MissingConfigurationException extends X402Exception
{
    public function __construct(string $key)
    {
        parent::__construct(
            "x402: {$key} is required. Set X402_" . strtoupper($key) . " in your .env or pass it to the middleware."
        );
    }
}
