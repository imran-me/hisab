<?php

namespace Hisab\Budgets\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Budgets\Models\Goal;
use Hisab\Budgets\Requests\GoalRequest;
use Hisab\Budgets\Services\GoalBook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** HTTP shaping only; progress is GoalBook's. */
class GoalController extends Controller
{
    public function __construct(private readonly GoalBook $goals)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->goals->all($request->user())]);
    }

    public function store(GoalRequest $request): JsonResponse
    {
        $data = $this->links($request, $request->validated());
        $goal = Goal::query()->create($data + [
            'user_id' => $request->user()->id,
            'currency' => 'BDT',
            // From the start of this month unless told otherwise, so a goal
            // set on the 28th still counts the deposit made on the 5th.
            'started_on' => $data['started_on'] ?? Carbon::now()->startOfMonth()->toDateString(),
        ]);

        return response()->json(['data' => $this->goals->one($request->user(), $goal)], 201);
    }

    public function update(GoalRequest $request, string $id): JsonResponse
    {
        $goal = $this->goal($request, $id);
        $goal->fill($this->links($request, $request->validated()))->save();

        return response()->json(['data' => $this->goals->one($request->user(), $goal)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->goal($request, $id)->delete();

        return response()->json(null, 204);
    }

    /**
     * A goal is fed by ONE thing: an account's balance or a deposit category.
     * Both would count a DPS instalment twice (once as the deposit, once in
     * the DPS balance it landed in). Each is resolved through the owner.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function links(Request $request, array $data): array
    {
        if (! empty($data['account_id']) && ! empty($data['category_id'])) {
            throw ValidationException::withMessages(['account_id' => __('Link an account or a category, not both.')]);
        }

        $owner = $request->user()->id;

        if (! empty($data['account_id'])) {
            abort_unless(DB::table('accounts')->where('user_id', $owner)->where('id', $data['account_id'])->exists(), 404);
            $data['category_id'] = null;
        }

        if (! empty($data['category_id'])) {
            abort_unless(DB::table('categories')->where('user_id', $owner)->where('id', $data['category_id'])
                ->where('type', 'deposit')->exists(), 404);
            $data['account_id'] = null;
        }

        return $data;
    }

    private function goal(Request $request, string $id): Goal
    {
        return Goal::query()->where('user_id', $request->user()->id)->where('id', $id)->firstOrFail();
    }
}
