<?php

namespace Hisab\Categories\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Models\NecessityBand;
use Hisab\Categories\Models\PaymentMethod;
use Hisab\Categories\Requests\StoreCategoryRequest;
use Hisab\Categories\Requests\UpdateCategoryRequest;
use Hisab\Categories\Services\CategoryBook;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function __construct(private readonly CategoryBook $book)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'book' => ['sometimes', Rule::in(Category::BOOKS)],
            'type' => ['sometimes', Rule::in(Category::TYPES)],
            'include_archived' => ['sometimes', 'boolean'],
        ]);

        $rows = $this->owned($request)
            ->where('book', $filters['book'] ?? 'personal')
            ->where('type', $filters['type'] ?? 'expense')
            // Archived rows exist for history, not for picking, so they are out
            // unless asked for.
            ->when(
                ! ($filters['include_archived'] ?? false),
                fn (Builder $q): Builder => $q->active(),
            )
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get()
            ->map($this->shape(...));

        return response()->json(['data' => $rows]);
    }

    /**
     * Every book and type in one response, archived rows included. See
     * endpoints.md, "all".
     *
     * The browser needs the whole set on every page (a historical row's
     * category is resolved by id wherever it lives), and asking for it one
     * book-and-type at a time was six requests. On a server that answers one
     * request at a time, six requests are six queues.
     */
    public function all(Request $request): JsonResponse
    {
        $out = [];
        foreach (Category::BOOKS as $book) {
            foreach (Category::TYPES as $type) {
                $out[$book][$type] = [];
            }
        }

        $this->owned($request)
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get()
            ->each(function (Category $c) use (&$out): void {
                $out[$c->book][$c->type][] = $this->shape($c);
            });

        return response()->json(['data' => $out]);
    }

    /** The one-tap tiles on the entry sheet. See endpoints.md, "frequent". */
    public function frequent(Request $request): JsonResponse
    {
        $f = $request->validate([
            'book' => ['sometimes', Rule::in(Category::BOOKS)],
            'type' => ['sometimes', Rule::in(Category::TYPES)],
            'days' => ['sometimes', 'integer', 'min:1', 'max:366'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:24'],
        ]);

        $rows = $this->book->frequent(
            $request->user(),
            $f['book'] ?? 'personal',
            $f['type'] ?? 'expense',
            (int) ($f['days'] ?? 60),
            (int) ($f['limit'] ?? 8),
        );

        return response()->json(['data' => array_map(
            fn (array $r): array => $this->shape($r['category']) + [
                'uses' => $r['uses'],
                'last_account_id' => $r['last_account_id'],
            ],
            $rows,
        )]);
    }

    public function store(StoreCategoryRequest $request): JsonResponse
    {
        $category = $this->book->create(
            $request->user(),
            (string) ($request->string('book')->toString() ?: 'personal'),
            (string) $request->string('type'),
            (string) $request->string('label'),
            $request->integer('necessity') ?: null,
        );

        return response()->json(['data' => $this->shape($category)], 201);
    }

    public function update(UpdateCategoryRequest $request, string $id): JsonResponse
    {
        $category = $this->book->rename($this->find($request, $id), (string) $request->string('label'));

        return response()->json(['data' => $this->shape($category)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $outcome = $this->book->remove($this->find($request, $id));

        return response()->json(['data' => ['id' => $id] + $outcome]);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $category = $this->book->restore($this->find($request, $id));

        return response()->json(['data' => $this->shape($category)]);
    }

    public function necessity(): JsonResponse
    {
        $rows = NecessityBand::query()->orderBy('band')->get()
            ->map(fn (NecessityBand $b): array => [
                'band' => $b->band, 'key' => $b->key, 'label' => $b->label, 'hint' => $b->hint,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function methods(): JsonResponse
    {
        $rows = PaymentMethod::query()->orderBy('sort_order')->get()
            ->map(fn (PaymentMethod $m): array => [
                'key' => $m->key, 'label' => $m->label, 'icon' => $m->icon,
            ]);

        return response()->json(['data' => $rows]);
    }

    /**
     * Resolved THROUGH the owner, per api-contract.md §6 — never fetched by id
     * and then checked. Someone else's id gives 404 and not 403: confirming
     * that an id exists is itself information.
     *
     * Archived rows are included, because restore() and delete() both need to
     * reach one.
     */
    private function find(Request $request, string $id): Category
    {
        return $this->owned($request)->findOrFail($id);
    }

    private function owned(Request $request): Builder
    {
        return Category::query()->where('user_id', $request->user()->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(Category $category): array
    {
        return [
            'id' => $category->id,
            'key' => $category->key,
            'label' => $category->label,
            'type' => $category->type,
            'book' => $category->book,
            'necessity' => $category->necessity,
            'archived_at' => $category->archived_at?->toJSON(),
            'created_at' => $category->created_at?->toJSON(),
        ];
    }
}
