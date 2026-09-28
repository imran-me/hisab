<?php

namespace Hisab\Dues\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Dues\Models\DuePerson;
use Hisab\Dues\Requests\PersonRequest;
use Hisab\Dues\Requests\RecordDueRequest;
use Hisab\Dues\Services\DueBook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** HTTP shaping only; every rule is DueBook's. */
class DueController extends Controller
{
    public function __construct(private readonly DueBook $dues)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $q = $request->validate(['book' => ['sometimes', 'string', 'in:personal,business']]);

        return response()->json(['data' => $this->dues->overview($request->user(), $q['book'] ?? 'personal')]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->dues->person($request->user(), $this->person($request, $id))]);
    }

    public function store(PersonRequest $request): JsonResponse
    {
        $person = DuePerson::query()->create($request->validated() + [
            'user_id' => $request->user()->id,
            'book' => $request->validated('book') ?? 'personal',
        ]);

        return response()->json(['data' => $this->dues->person($request->user(), $person)['person']], 201);
    }

    public function update(PersonRequest $request, string $id): JsonResponse
    {
        $person = $this->person($request, $id);
        // A person never changes book: their dues are transfers in that book.
        $person->fill(collect($request->validated())->except('book')->all())->save();

        return response()->json(['data' => $this->dues->person($request->user(), $person)['person']]);
    }

    public function record(RecordDueRequest $request, string $id): JsonResponse
    {
        $person = $this->person($request, $id);
        $this->dues->record($request->user(), $person, $request->validated());

        return response()->json(['data' => $this->dues->person($request->user(), $person)], 201);
    }

    public function settle(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'account_id' => ['required', 'string', 'size:26'],
            'occurred_on' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        $person = $this->person($request, $id);
        $this->dues->settle($request->user(), $person, $data['account_id'], $data['occurred_on'] ?? null);

        return response()->json(['data' => $this->dues->person($request->user(), $person->refresh())], 201);
    }

    /** Through the owner, so someone else's person is a 404 like a missing one. */
    private function person(Request $request, string $id): DuePerson
    {
        return DuePerson::query()->where('user_id', $request->user()->id)->where('id', $id)->firstOrFail();
    }
}
