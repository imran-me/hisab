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
