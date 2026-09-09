<?php

namespace Hisab\Accounts\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Accounts\Models\Account;
use Hisab\Accounts\Requests\StoreAccountRequest;
use Hisab\Accounts\Requests\UpdateAccountRequest;
use Hisab\Accounts\Services\AccountBook;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function __construct(private readonly AccountBook $book)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'book' => ['sometimes', 'string', 'max:32'],
            'include_archived' => ['sometimes', 'boolean'],
        ]);

        $rows = $this->owned($request)
            ->when(
                isset($filters['book']),
                fn (Builder $q): Builder => $q->where('book', $filters['book']),
            )
            ->when(
                ! ($filters['include_archived'] ?? false),
                fn (Builder $q): Builder => $q->active(),
            )
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        // An object with data and meta, never a bare array - api-contract.md §2:
        // a bare array cannot grow a meta without breaking every consumer, and
        // it will need one the first time this is paginated.
        return response()->json([
            'data' => $rows->map($this->shape(...)),
            'meta' => ['total' => $rows->count()],
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->shape($this->find($request, $id))]);
    }

    public function store(StoreAccountRequest $request): JsonResponse
    {
        $account = $this->book->create($request->user(), $request->validated());

        return response()->json(['data' => $this->shape($account)], 201);
    }

    public function update(UpdateAccountRequest $request, string $id): JsonResponse
    {
        $account = $this->book->update($this->find($request, $id), $request->validated());

        return response()->json(['data' => $this->shape($account)]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['string', 'size:26'],
        ]);

        $this->book->reorder($request->user(), $data['ids']);

        return response()->json(null, 204);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        // Throws a 409 carrying the transaction count when the account is
        // referenced. Archiving is the answer then, and the client offers it.
        $this->book->delete($this->find($request, $id));

        return response()->json(null, 204);
    }

    private function find(Request $request, string $id): Account
    {
        // Resolved through the owner. 404 and not 403 for someone else's id:
        // confirming that an id exists is itself information.
        return $this->owned($request)->findOrFail($id);
    }

    private function owned(Request $request): Builder
    {
        return Account::query()->where('user_id', $request->user()->id);
    }

    /**
     * NOTE WHAT IS NOT IN HERE: a balance.
     *
     * Balances are derived from the ledger and served by
     * GET /api/ledger/balances, so there is exactly one place that computes
     * them. Returning one here as well would be two implementations of the same
     * sum, and one of them would be wrong first.
     *
     * @return array<string, mixed>
     */
    private function shape(Account $account): array
    {
        return [
            'id' => $account->id,
            'name' => $account->name,
            'type' => $account->type,
            'currency' => $account->currency,
            'book' => $account->book,
            'opening_balance_minor' => $account->opening_balance_minor,
            'opening_on' => $account->opening_on,
            'institution' => $account->institution,
            'number_tail' => $account->number_tail,
            'credit_limit_minor' => $account->credit_limit_minor,
            'is_default' => $account->is_default,
            'sort_order' => $account->sort_order,
            'archived_at' => $account->archived_at?->toJSON(),
            'created_at' => $account->created_at?->toJSON(),
        ];
    }
}
