<?php

namespace Hisab\Categories\Services;

use App\Models\User;
use App\Support\Slug;
use Hisab\Categories\Models\Category;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Every rule about categories, in one place.
 */
class CategoryBook
{
    /**
     * Is this name already taken by an ACTIVE category in the same book and type?
     *
     * Case-insensitive, because two categories differing only in case split a
     * year of spending across two rows in every report and are indistinguishable
     * in the picker.
     *
     * Done in PHP rather than as a unique index for two reasons: archived rows
     * are exempt, so a name freed by archiving can be reused; and
     * case-insensitivity in the database depends on the column collation, which
     * differs between MySQL and SQLite - so the constraint would hold in
     * production and not in the tests, or the reverse.
     */
    public function nameIsTaken(User $user, string $book, string $type, string $label, ?string $exceptId = null): bool
    {
        return $this->scope($user, $book, $type)
            ->active()
            ->when($exceptId !== null, fn (Builder $q): Builder => $q->whereKeyNot($exceptId))
            // Lowercasing BOTH sides makes the comparison independent of the
            // column's collation.
            ->whereRaw('LOWER(label) = ?', [Str::lower(trim($label))])
            ->exists();
    }

    public function create(User $user, string $book, string $type, string $label, ?int $necessity): Category
    {
        $label = trim($label);

        if ($this->nameIsTaken($user, $book, $type, $label)) {
            throw ValidationException::withMessages([
                'label' => __('A category with that name already exists.'),
            ]);
        }

        $category = new Category([
            'user_id' => $user->id,
            'label' => $label,
            'type' => $type,
            'book' => $book,
            // Forced to match the type rather than trusted: there is no sense in
            // which a salary is discretionary, and a band on one would show up
            // in necessity reports as spending.
            'necessity' => $type === 'expense' ? ($necessity ?? 3) : null,
            'sort_order' => $this->scope($user, $book, $type)->max('sort_order') + 1,
        ]);

        // The id has to exist before the key can fall back to it. HasHisabUlid
        // fills it on creating, so it is set explicitly here instead.
        $category->id = $category->newUniqueId();

        // slugify() drops Bengali and Arabic rather than transliterating, so a
        // label written entirely in Bangla produces nothing - see App\Support\Slug.
        $category->key = Slug::make($label) ?: Str::lower($category->id);

        $category->save();

        return $category;
    }

    public function rename(Category $category, string $label): Category
    {
        $label = trim($label);

        if ($this->nameIsTaken($category->user, $category->book, $category->type, $label, $category->id)) {
            throw ValidationException::withMessages([
                'label' => __('A category with that name already exists.'),
            ]);
        }

        // The label changes; the key does NOT. The key is a stable handle used
        // in exports and URLs, and re-slugging on every rename would break any
        // reference to the old one for a cosmetic gain.
        $category->update(['label' => $label]);

        return $category;
    }

    /**
     * Archive, or hard-delete when nothing has ever referenced it.
     *
     * CONVENTIONS.md §5: deletion is archival, with exactly one exception - a
     * record created and removed without ever being referenced. That is the
     * "made it by mistake a minute ago" case, and a tombstone for it is clutter
     * with no history to protect.
     *
     * @return array{deleted: bool, archived_at: ?string}
     */
    public function remove(Category $category): array
    {
        if (! $this->hasTransactions($category)) {
            $category->delete();

            return ['deleted' => true, 'archived_at' => null];
        }

        $category->update(['archived_at' => Carbon::now()]);

        return ['deleted' => false, 'archived_at' => $category->archived_at->toJSON()];
    }

    public function restore(Category $category): Category
    {
        if ($this->nameIsTaken($category->user, $category->book, $category->type, $category->label, $category->id)) {
            // Refused rather than silently allowed. Restoring into a name an
            // active category now holds would create exactly the duplicate that
            // create() rejects.
            throw ValidationException::withMessages([
                'label' => __('A category with that name already exists. Rename that one first.'),
            ]);
        }

        $category->update(['archived_at' => null]);

        return $category;
    }

    /**
     * Whether any transaction points at this category.
     *
     * The ledger module owns that table and does not exist yet, so this asks the
     * schema rather than a model: a hard reference to Hisab\Ledger from here
     * would be a dependency between modules, which CONVENTIONS.md forbids, and
     * would break the module test in both directions at once.
     */
    private function hasTransactions(Category $category): bool
    {
        $schema = $category->getConnection()->getSchemaBuilder();

        if (! $schema->hasTable('transactions')) {
            return false;
        }

        return $category->getConnection()
            ->table('transactions')
            ->where('category_id', $category->id)
            ->exists();
    }

    private function scope(User $user, string $book, string $type): Builder
    {
        // Resolved THROUGH the owner, per api-contract.md §6.
        return Category::query()
            ->where('user_id', $user->id)
            ->where('book', $book)
            ->where('type', $type);
    }
}
