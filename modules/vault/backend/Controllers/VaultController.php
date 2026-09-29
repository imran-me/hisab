<?php

namespace Hisab\Vault\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Vault\Models\VaultHeader;
use Hisab\Vault\Models\VaultItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/**
 * /api/vault - the owner's encrypted vault. See ../endpoints.md.
 *
 * The server stores what it is given and cannot read it. The only checks are
 * on SHAPE and SIZE: a blob is { v, iv, ct } and under a cap, so one entry
 * cannot fill the database. Nothing here logs a request body - a payload in a
 * log file would sit outside the at-rest encryption and quietly remove the
 * outer layer.
 */
class VaultController extends Controller
{
    /** A generous ceiling for one entry's ciphertext: a long secure note. */
    private const MAX_BLOB_BYTES = 64 * 1024;

    private const MAX_HEADER_BYTES = 8 * 1024;

    // ------------------------------------------------------------------ header

    public function showHeader(Request $request): JsonResponse
    {
        $header = VaultHeader::query()->find($request->user()->id);

        return $header
            ? response()->json(['data' => $header->header])
            : response()->json(['message' => 'No vault has been set up yet.'], 404);
    }

    /** First-time setup. Refuses when a vault exists: that would orphan every entry. */
    public function storeHeader(Request $request): JsonResponse
    {
        $header = $this->header($request);

        if (VaultHeader::query()->whereKey($request->user()->id)->exists()) {
            return response()->json(['message' => 'A vault already exists for this account.'], 409);
        }

        VaultHeader::query()->create(['user_id' => $request->user()->id, 'header' => $header]);

        return response()->json(['data' => $header], 201);
    }

    /** After a master-password change: the same key, wrapped again. */
    public function updateHeader(Request $request): JsonResponse
    {
        $header = $this->header($request);
        $row = VaultHeader::query()->find($request->user()->id);

        if (! $row) {
            return response()->json(['message' => 'No vault has been set up yet.'], 404);
        }

        $row->update(['header' => $header]);

        return response()->json(['data' => $header]);
    }

    // ----------------------------------------------------------------- entries

    public function index(Request $request): JsonResponse
    {
        $rows = VaultItem::query()
            ->where('user_id', $request->user()->id)
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $rows->map($this->shape(...))->values()]);
    }

    /**
     * Create, with the id the browser minted. Sending the same id again
     * replaces it: an entry saved offline is pushed when the phone is back,
     * and a retry after a dropped response must not become a second copy.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'string', 'regex:/^[0-9A-HJKMNP-TV-Z]{26}$/'],
        ]);
        $blob = $this->blob($request);

        $existing = VaultItem::query()->find($data['id']);
        if ($existing && $existing->user_id !== $request->user()->id) {
            // Someone else's id. Said as a conflict, not a 404 or a replace.
            return response()->json(['message' => 'That id is taken.'], 409);
        }

        if ($existing) {
            $existing->update(['blob' => $blob]);

            return response()->json(['data' => $this->shape($existing)]);
        }

        $row = VaultItem::query()->create([
            'id' => $data['id'],
            'user_id' => $request->user()->id,
            'blob' => $blob,
        ]);

        return response()->json(['data' => $this->shape($row)], 201);
    }

    /** Replace a blob wholesale: the server cannot merge fields it cannot read. */
    public function update(Request $request, string $id): JsonResponse
    {
        $row = $this->find($request, $id);
        $row->update(['blob' => $this->blob($request)]);

        return response()->json(['data' => $this->shape($row)]);
    }

    public function destroy(Request $request, string $id): Response
    {
        $this->find($request, $id)->delete();

        return response()->noContent();
    }

    // ----------------------------------------------------------------- helpers

    private function find(Request $request, string $id): VaultItem
    {
        return VaultItem::query()
            ->where('user_id', $request->user()->id)
            ->findOrFail(strtoupper($id));
    }

    /** @return array<string, mixed> */
    private function blob(Request $request): array
    {
        $data = $request->validate([
            'blob' => ['required', 'array'],
            'blob.v' => ['required', 'integer'],
            'blob.iv' => ['required', 'string', 'max:64'],
            'blob.ct' => ['required', 'string'],
        ]);

        if (strlen((string) json_encode($data['blob'])) > self::MAX_BLOB_BYTES) {
            throw ValidationException::withMessages(['blob' => 'This entry is too large to store.']);
        }

        return $data['blob'];
    }

    /** @return array<string, mixed> */
    private function header(Request $request): array
    {
        // Sent as the header object itself, which is what the browser has.
        $header = $request->validate([
            'v' => ['required', 'integer'],
            'kdf' => ['required', 'array'],
            'salt' => ['required', 'string', 'max:128'],
            'wrap' => ['required', 'array'],
            'verifier' => ['required', 'array'],
        ]);

        $full = $request->only(['v', 'kdf', 'salt', 'wrap', 'verifier', 'created_at']);
        if (strlen((string) json_encode($full)) > self::MAX_HEADER_BYTES) {
            throw ValidationException::withMessages(['header' => 'This vault header is too large.']);
        }

        return $full + $header;
    }

    /** @return array<string, mixed> */
    private function shape(VaultItem $row): array
    {
        return [
            'id' => $row->id,
            'blob' => $row->blob,
            'created_at' => $row->created_at?->toJSON(),
            'updated_at' => $row->updated_at?->toJSON(),
        ];
    }
}
