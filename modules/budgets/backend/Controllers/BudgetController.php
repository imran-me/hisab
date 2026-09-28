<?php

namespace Hisab\Budgets\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Budgets\Models\Budget;
use Hisab\Budgets\Requests\SetBudgetRequest;
use Hisab\Budgets\Services\BudgetBook;
use Hisab\Categories\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * HTTP shaping only. Every figure is BudgetBook's.
 */
class BudgetController extends Controller
{
    public function __construct(private readonly BudgetBook $book)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $q = $request->validate([
            'month' => ['sometimes', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'book' => ['sometimes', 'string', 'in:personal,business'],
            'currency' => ['sometimes', 'string', 'size:3', 'exists:currencies,code'],
        ]);

        return response()->json(['data' => $this->book->month(
            $request->user(),
            $q['book'] ?? 'personal',
            $q['month'] ?? Carbon::now()->format('Y-m'),
            strtoupper($q['currency'] ?? 'BDT'),
        )]);
    }

    public function update(SetBudgetRequest $request, string $categoryId): JsonResponse
    {
        $category = $this->category($request, $categoryId);

        $budget = Budget::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'category_id' => $category->id],
            [
                'book' => $category->book,
                'amount_minor' => (int) $request->validated('amount_minor'),
                'currency' => strtoupper((string) ($request->validated('currency') ?? 'BDT')),
                // A budget the owner set is theirs, even over a demo one.
                'is_demo' => false,
            ],
        );

        return response()->json(['data' => $budget->only(['id', 'category_id', 'book', 'amount_minor', 'currency'])]);
    }

    public function destroy(Request $request, string $categoryId): JsonResponse
    {
        $deleted = Budget::query()
            ->where('user_id', $request->user()->id)
            ->where('category_id', $categoryId)
            ->delete();

        abort_if($deleted === 0, 404);

        return response()->json(null, 204);
    }

    /**
     * Resolved through the owner, so someone else's category is a 404 - the
     * same answer as one that does not exist (CONVENTIONS.md).
     */
    private function category(Request $request, string $id): Category
    {
        return Category::query()
            ->where('user_id', $request->user()->id)
            ->where('id', $id)
            ->where('type', 'expense')
            ->firstOrFail();
    }
}
