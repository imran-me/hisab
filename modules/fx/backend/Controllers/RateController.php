<?php

namespace Hisab\Fx\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Fx\Models\FxRate;
use Hisab\Fx\Requests\StoreRateRequest;
use Hisab\Fx\Services\RateBook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Rates. Thin by requirement - the rule about which row wins lives in RateBook.
 */
class RateController extends Controller
{
    public function __construct(private readonly RateBook $rates)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $rows = $this->rates
            ->current($request->user()?->id)
            ->map($this->shape(...));

        return response()->json(['data' => $rows]);
    }

    public function store(StoreRateRequest $request): JsonResponse
    {
        $rate = $this->rates->record(
            $request->user()->id,
            strtoupper((string) $request->string('base')),
            strtoupper((string) $request->string('quote')),
            (string) $request->string('rate'),
            (string) $request->string('as_of'),
        );

        return response()->json(['data' => $this->shape($rate)], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(FxRate $rate): array
    {
        return [
            // The client sends this id back when it snapshots a rate onto a
            // transaction. api-contract.md §7: it sends the RATE ID, never a
            // rate - a client that can post its own rate can post any figure it
            // likes into a converted total.
            'id' => $rate->id,
            'base' => $rate->base,
            'quote' => $rate->quote,
            // A STRING, not a float. api-contract.md: a rate is a decimal, and
            // IEEE-754 cannot hold 122.5 exactly any more than it can hold 0.1.
            // The client parses it.
            'rate' => (string) $rate->getRawOriginal('rate'),
            'as_of' => $rate->as_of,
            'source' => $rate->source,
        ];
    }
}
