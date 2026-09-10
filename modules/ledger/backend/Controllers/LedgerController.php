<?php

namespace Hisab\Ledger\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Requests\StoreTransactionRequest;
use Hisab\Ledger\Requests\UpdateTransactionRequest;
use Hisab\Ledger\Services\BalanceSheet;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LedgerController extends Controller
{
    private const MAX_LIMIT = 200;

    public function __construct(
        private readonly LedgerWriter $writer,
        private readonly BalanceSheet $balances,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'book' => ['sometimes', 'string', 'max:32'],
            'period' => ['sometimes', 'date_format:Y-m'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'type' => ['sometimes', 'string'],
            'account_id' => ['sometimes', 'string'],
            'category_id' => ['sometimes', 'string'],
            'q' => ['sometimes', 'string', 'max:120'],
            'after' => ['sometimes', 'string', 'size:26'],
            'include_reversed' => ['sometimes', 'boolean'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_LIMIT],
        ]);

        $limit = (int) ($f['limit'] ?? 50);
        [$from, $to] = $this->range($f);

        $query = $this->owned($request)
            // A ledger where every fixed typo occupies three rows is a ledger
            // nobody can read, so reversals and the entries they cancel are out
            // by default. They are NOT excluded from any total - they net to
            // zero on their own - so this is presentation only.
            ->when(! ($f['include_reversed'] ?? false), fn (Builder $q) => $q->standing())
            ->when(isset($f['book']), fn (Builder $q) => $q->where('book', $f['book']))
            ->when($from !== null, fn (Builder $q) => $q->where('occurred_on', '>=', $from))
            ->when($to !== null, fn (Builder $q) => $q->where('occurred_on', '<=', $to))
            ->when(isset($f['type']), fn (Builder $q) => $q->where('type', $f['type']))
            ->when(isset($f['account_id']), fn (Builder $q) => $q->where('account_id', $f['account_id']))
            ->when(isset($f['category_id']), fn (Builder $q) => $q->where('category_id', $f['category_id']))
            ->when(isset($f['q']), function (Builder $q) use ($f): void {
                $term = '%'.$f['q'].'%';
                $q->where(fn (Builder $w) => $w
                    ->where('payee', 'like', $term)
                    ->orWhere('note', 'like', $term)
                    ->orWhere('category_label', 'like', $term));
            })
            // Cursor pagination on id, not offset - api-contract.md §8. A ledger
            // is written to while it is being read, and an offset shows a row
            // twice or skips one every time something is inserted above the
            // current page, which for a transaction list is most of the time.
            ->when(isset($f['after']), fn (Builder $q) => $q->where('id', '<', strtoupper($f['after'])))
            ->orderByDesc('occurred_on')
            ->orderByDesc('id');

        // One more than asked for, to know whether another page exists without
        // running a second count query over the whole ledger.
        $rows = $query->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);

        return response()->json([
            'data' => $rows->map($this->shape(...))->values(),
            'meta' => [
                'count' => $rows->count(),
                'has_more' => $hasMore,
                'next_cursor' => $hasMore ? $rows->last()?->id : null,
            ],
        ]);
    }

    public function store(StoreTransactionRequest $request): JsonResponse
    {
        $legs = $this->writer->create($request->user(), $request->validated());

        return response()->json([
            'data' => $this->shape($legs->first()),
            // Both legs, so the client can insert the pair without refetching.
            'meta' => ['legs' => $legs->map($this->shape(...))->values()],
        ], 201);
    }

    /**
     * Correct an entry. NOT an edit - see the writer, and endpoints.md.
     *
     * The original is reversed and a replacement recorded; both survive.
     */
    public function update(UpdateTransactionRequest $request, string $id): JsonResponse
    {
        $data = $request->validated();
        $reason = $data['reason'] ?? null;
        unset($data['reason']);

        $legs = $this->writer->correct(
            $request->user(),
            $this->find($request, $id),
            $data,
            $reason,
        );

        return response()->json([
            'data' => $this->shape($legs->first()),
            'meta' => ['legs' => $legs->map($this->shape(...))->values()],
        ]);
    }

    /**
     * Reverse, with a reason. DELETE is the same thing without one.
     */
    public function reverse(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['sometimes', 'nullable', 'string', 'max:160']]);

        $mirrors = $this->writer->reverse(
            $request->user(),
            $this->find($request, $id),
            $data['reason'] ?? __('Reversed'),
        );

        return response()->json([
            'data' => $this->shape($mirrors->first()),
            'meta' => ['legs' => $mirrors->map($this->shape(...))->values()],
        ], 201);
    }

    /**
     * Nothing is destroyed. This reverses, and answers 201 with the mirror -
     * the client shows it rather than removing a row from the list.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $mirrors = $this->writer->reverse(
            $request->user(),
            $this->find($request, $id),
            (string) ($request->input('reason') ?: __('Removed')),
        );

        return response()->json([
            'data' => $this->shape($mirrors->first()),
            'meta' => ['legs' => $mirrors->map($this->shape(...))->values()],
        ], 201);
    }

    public function balances(Request $request): JsonResponse
    {
        $book = $request->query('book');

        return response()->json([
            'data' => $this->balances->balances($request->user(), $book ? (string) $book : null),
            'meta' => ['as_of' => Carbon::now()->toDateString()],
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $f = $request->validate([
            'book' => ['sometimes', 'string', 'max:32'],
            'period' => ['sometimes', 'date_format:Y-m'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        [$from, $to] = $this->range($f);
        $month = Carbon::now();

        return response()->json([
            'data' => $this->balances->summary(
                $request->user(),
                (string) ($f['book'] ?? 'personal'),
                $from ?? $month->copy()->startOfMonth()->toDateString(),
                $to ?? $month->copy()->endOfMonth()->toDateString(),
            ),
        ]);
    }

    /**
     * `period=YYYY-MM` is shorthand for that whole month, and the explicit
     * from/to win when both are given.
     *
     * @param  array<string, mixed>  $f
     * @return array{0: ?string, 1: ?string}
     */
    private function range(array $f): array
    {
        if (isset($f['period'])) {
            $month = Carbon::createFromFormat('Y-m', $f['period'])->startOfMonth();

            return [
                $f['from'] ?? $month->toDateString(),
                $f['to'] ?? $month->copy()->endOfMonth()->toDateString(),
            ];
        }

        return [$f['from'] ?? null, $f['to'] ?? null];
    }

    private function find(Request $request, string $id): Transaction
    {
        return $this->owned($request)->findOrFail($id);
    }

    private function owned(Request $request): Builder
    {
        return Transaction::query()->where('user_id', $request->user()->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(Transaction $t): array
    {
        return [
            'id' => $t->id,
            'group_id' => $t->group_id,
            'reverses_id' => $t->reverses_id,
            'reversal_reason' => $t->reversal_reason,
            'corrects_id' => $t->corrects_id,
            'type' => $t->type,
            'direction' => $t->direction,
            'account_id' => $t->account_id,
            'counter_account_id' => $t->counter_account_id,
            'amount_minor' => $t->amount_minor,
            'currency' => $t->currency,
            'category_id' => $t->category_id,
            'category_label' => $t->category_label,
            'necessity' => $t->necessity,
            'method' => $t->method,
            'payee' => $t->payee,
            'note' => $t->note,
            'occurred_on' => $t->occurred_on,
            'book' => $t->book,
            // A string, so no digits are lost through a float.
            'fx_rate' => $t->fx_rate === null ? null : (string) $t->getRawOriginal('fx_rate'),
            'fx_as_of' => $t->fx_as_of,
            'created_at' => $t->created_at?->toJSON(),
            'updated_at' => $t->updated_at?->toJSON(),
        ];
    }
}
