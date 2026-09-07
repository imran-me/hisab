<?php

use App\Providers\AppServiceProvider;
use Hisab\Auth\AuthServiceProvider;
use Hisab\Fx\FxServiceProvider;

return [
    AppServiceProvider::class,
    AuthServiceProvider::class,
    FxServiceProvider::class,
];
