# TODO

## Eligibility: batch staging-change checks on full load (N+1)

On a **full** eligibility run (`run(null)`), each user-set contact (`last_updated_by` ≠ `SYSTEM`) calls `hasStagingDataChanged()` — one extra `EXISTS` query per contact. Incremental runs are less affected (contacts are already filtered by `changed_contacts`).

**Impact**: Performance only; correctness is unchanged. Revisit if full loads grow or job duration becomes an issue.

**Fix**: Batch user-set contacts into a single query (e.g. unnest person IDs + `since` per contact, or one query per distinct effective date) instead of per-contact round-trips.

**File**: `backend/src/sync/eligibility/eligibility.service.ts` — `run()` user-set block (~BL-14B skip)

**Related**: User-set preservation PR (`fix/user-set-eligibility-preserve`); code review item 4.
