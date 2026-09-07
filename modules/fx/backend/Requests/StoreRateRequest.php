<?php

namespace Hisab\Fx\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'base' => ['required', 'string', 'size:3', Rule::exists('currencies', 'code')],

            // A pair of a currency with itself is always 1 by definition, and
            // storing it invites a row that says otherwise - after which every
            // same-currency conversion is silently wrong.
            'quote' => ['required', 'string', 'size:3', 'different:base', Rule::exists('currencies', 'code')],

            // gt:0, not just numeric. Zero or negative is not a rate: it makes
            // every converted figure zero or negative, and it is the kind of
            // typo that is invisible inside a total.
            //
            // decimal:0,10 matches the column. Without it, an eleventh decimal
            // place is silently rounded away by the database and the row that
            // comes back does not equal the one that was sent.
            'rate' => ['required', 'numeric', 'gt:0', 'decimal:0,10'],

            // A rate that "was true" on a date which has not happened cannot
            // have been. today() and not now(): as_of is a date, and a timestamp
            // comparison would reject a rate entered for today.
            'as_of' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'quote.different' => 'A currency is always worth one of itself.',
            'rate.gt' => 'A rate has to be greater than zero.',
            'as_of.before_or_equal' => 'A rate cannot be dated in the future.',
        ];
    }

    protected function prepareForValidation(): void
    {
        // Uppercase before validating, so 'usd' passes the exists rule rather
        // than failing with a message about a currency the person did type.
        $this->merge(array_filter([
            'base' => $this->has('base') ? strtoupper((string) $this->input('base')) : null,
            'quote' => $this->has('quote') ? strtoupper((string) $this->input('quote')) : null,
        ], fn ($v) => $v !== null));
    }
}
