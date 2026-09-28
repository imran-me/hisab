<?php

namespace Hisab\Dues\Requests;

use Hisab\Dues\Models\DueEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One due. No balance field: a person's balance is derived from the ledger,
 * and a request that carried one could edit a debt into anything.
 */
class RecordDueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(array_keys(DueEntry::KINDS))],
            'amount_minor' => ['required', 'integer', 'min:1', 'max:9000000000000000'],
            'account_id' => ['required', 'string', 'size:26'],
            'occurred_on' => ['sometimes', 'date_format:Y-m-d'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
