<?php

use App\Providers\AppServiceProvider;
use Hisab\Accounts\AccountsServiceProvider;
use Hisab\Auth\AuthServiceProvider;
use Hisab\Budgets\BudgetsServiceProvider;
use Hisab\Categories\CategoriesServiceProvider;
use Hisab\Dues\DuesServiceProvider;
use Hisab\Fx\FxServiceProvider;
use Hisab\Ledger\LedgerServiceProvider;

return [
    AppServiceProvider::class,
    AuthServiceProvider::class,
    FxServiceProvider::class,
    CategoriesServiceProvider::class,
    AccountsServiceProvider::class,
    LedgerServiceProvider::class,
    BudgetsServiceProvider::class,
    DuesServiceProvider::class,
];
