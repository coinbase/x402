<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\Set\ValueObject\LevelSetList;
use Rector\Php84\Rector\Param\ExplicitNullableParamTypeRector;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/src',
    ])
    ->withSkip([
    __DIR__ . '/src/Paywall/template.php',
    ])
    ->withPhpVersion(\Rector\ValueObject\PhpVersion::PHP_85)
    ->withSets([
        LevelSetList::UP_TO_PHP_84,
    ])
    ->withRules([
        ExplicitNullableParamTypeRector::class,
    ])
    ->withPreparedSets(
        deadCode: true,
        codeQuality: true,
        typeDeclarations: true,
    );
