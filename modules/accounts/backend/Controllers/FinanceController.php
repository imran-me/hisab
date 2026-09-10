<?php

namespace Hisab\Accounts\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Accounts\Models\FinanceSetting;
use Hisab\Accounts\Models\MonthClose;
use Hisab\Accounts\Services\MonthCockpit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The Accounts screen's data, in one place.
 *
 * Thin by requirement - every figure is computed in MonthCockpit, so the
 * browser and any future client get the same answer rather than each deriving
 * carry-over and the quality weighting for themselves.
 */
class FinanceController extends Controller
{
    public function __construct(private readonly MonthCockpit $cockpit)
    {
    }

    /** Everything one month needs, in a single request. */
    public function month(Request $request, string $month): JsonResponse
    {
        $this->assertMonth($month);

        return response()->json(['data' => $this->cockpit->month($request->user(), $month)]);
    }

    /** Which months have anything in them. */
    public function months(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->cockpit->months($request->user())]);
    }

    public function settings(Request $request): JsonResponse
    {
        return response()->json(['data' => FinanceSetting::forOwner($request->user())]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Signed: someone can genuinely start a ledger overdrawn, and
            // refusing that would make it impossible to record honestly.
            'opening_balance_minor' => ['sometimes', 'integer'],
            'carry_forward' => ['sometimes', 'boolean'],
            // A budget and a goal are targets, so zero means "not set" rather
            // than "spend nothing".
            'monthly_budget_minor' => ['sometimes', 'integer', 'min:0'],
            'savings_goal_minor' => ['sometimes', 'integer', 'min:0'],
        ]);

        $settings = FinanceSetting::forOwner($request->user());
        $settings->fill($data)->save();

        return response()->json(['data' => $settings]);
    }

    /**
     * File a month.
     *
     * Closing changes NOTHING about the records. It writes a note and the
     * figures as they stood, so re-closing updates that review rather than
     * adding a second one - and a transaction added to the month afterwards
     * still lands there and still corrects every month after it.
     */
    public function close(Request $request, string $month): JsonResponse
    {
        $this->assertMonth($month);

        $data = $request->validate(['note' => ['sometimes', 'nullable', 'string', 'max:2000']]);
        $owner = $request->user();

        $close = MonthClose::query()->updateOrCreate(
            ['user_id' => $owner->id, 'month' => $month],
            [
                'note' => $data['note'] ?? null,
                // Snapshotted, not recomputed on read: what the month SAID when
                // it was reviewed is a historical fact, and re-deriving it later
                // would rewrite the review rather than the ledger.
                'snapshot' => $this->cockpit->month($owner, $month),
                'closed_at' => Carbon::now(),
            ],
        );

        return response()->json(['data' => $close], 201);
    }

    /** Reopen: removes the review. The records were never touched. */
    public function reopen(Request $request, string $month): JsonResponse
    {
        $this->assertMonth($month);

        MonthClose::query()
            ->where('user_id', $request->user()->id)->where('month', $month)->delete();

        return response()->json(null, 204);
    }

    public function closes(Request $request): JsonResponse
    {
        $rows = MonthClose::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('month')
            ->get(['month', 'note', 'closed_at']);

        return response()->json(['data' => $rows]);
    }

    /**
     * 'YYYY-MM' or nothing.
     *
     * Validated here rather than by a route pattern, because the failure has to
     * be a 422 the client can read - a route that simply does not match returns
     * 404, which reads as "no such month" rather than "that is not a month".
     */
    private function assertMonth(string $month): void
    {
        abort_unless((bool) preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month), 422, 'Expected a month as YYYY-MM.');
    }
}
