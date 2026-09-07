<?php

namespace Hisab\Fx\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Fx\Models\Currency;
use Illuminate\Http\JsonResponse;

/**
 * Currencies. Read-only over HTTP: a currency that does not exist is a
 * migration, not a POST.
 */
class CurrencyController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = Currency::query()
            ->orderBy('sort_order')
            ->orderBy('code')
            ->get()
            ->map(fn (Currency $c): array => [
                'code' => $c->code,
                'name' => $c->name,
                'symbol' => $c->symbol,
                'minor_unit' => $c->minor_unit,
                'group' => $c->group,
                'symbol_first' => $c->symbol_first,
            ]);

        return response()->json(['data' => $rows]);
    }
}
