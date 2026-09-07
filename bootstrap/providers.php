<?php

use App\Providers\AppServiceProvider;
use Hisab\Accounts\AccountsServiceProvider;
use Hisab\Auth\AuthServiceProvider;
use Hisab\Categories\CategoriesServiceProvider;
use Hisab\Fx\FxServiceProvider;

return [
    AppServiceProvider::class,
    AuthServiceProvider::class,
    FxServiceProvider::class,
    CategoriesServiceProvider::class,
    AccountsServiceProvider::class,
];
