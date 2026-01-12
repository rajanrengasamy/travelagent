# QA Report: Section 10 - Google Places Worker

**Generated**: 2026-01-11
**Reviewer**: qa-reviewer agent
**Status**: ISSUES_FOUND

## Executive Summary

The Google Places Worker implementation is well-structured with comprehensive test coverage (68 tests, all passing). However, several important issues were identified across error handling, edge cases, and PRD compliance that should be addressed for production readiness.

- **Critical Issues**: 1
- **Major Issues**: 4
- **Minor Issues**: 4
- **Total Issues**: 9

---

## Issues

### CRITICAL Issues

#### CRIT-1: Google Maps URL Format Inconsistent with PRD
- **File**: src/workers/places/mapper.ts:25, :361
- **Dimension**: PRD Compliance
- **Severity**: Critical
- **Description**:
  The PRD Section 5.2 specifies the Google Maps URL format as `https://maps.google.com/?cid=<place_id>` (using the CID parameter).

  However, the code uses two formats:
  1. Primary (when details.url available): Uses the direct URL from API (correct)
  2. Fallback (when no details.url): Uses `https://www.google.com/maps/place/?q=place_id:<place_id>` (incorrect format)

  The fallback URL format doesn't match the PRD specification and may not resolve correctly in all contexts.

- **Current Code**:
  ```typescript
  // Line 25 (mapper.ts)
  const GOOGLE_MAPS_PLACE_URL = 'https://www.google.com/maps/place/?q=place_id:';

  // Line 361 (mapper.ts)
  return `${GOOGLE_MAPS_PLACE_URL}${place.placeId}`;
  ```

- **PRD Requirement** (Section 5.2):
  ```
  SourceRef URL format: `https://maps.google.com/?cid=<place_id>`
  ```

- **Recommended Fix**:
  Update the fallback URL to match the PRD specification:
  ```typescript
  const GOOGLE_MAPS_PLACE_URL = 'https://maps.google.com/?cid=';
  ```

  Note: The `cid` parameter may not always be available in the API response. If unavailable, consider using the `place_id` query parameter as documented fallback with clear documentation of the difference.

---

### MAJOR Issues

#### MAJ-1: Address Parsing Fragility in Location Text Building
- **File**: src/workers/places/mapper.ts:451-467
- **Dimension**: Error Handling & Edge Cases
- **Severity**: Major
- **Description**:
  The `buildLocationText()` function assumes a specific address format with predictable comma-separated components. This is fragile and doesn't handle various real-world Google Places address formats:

  - Addresses with suite/apartment numbers: "Suite 100, 123 Main St, City, State, ZIP, Country"
  - International addresses with different structures: "House Number, Street, District, City, Province, Country"
  - Addresses without full hierarchy: "Tourist Area, City, Country"

  Current logic (lines 458-465):
  ```typescript
  const parts = place.formattedAddress.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    return `${parts[1]}, ${parts[2]}`;  // Assumes parts[1] is neighborhood, parts[2] is city
  }
  ```

  For address "Suite 200, 456 Business Ave, Downtown, New York, NY 10001, USA":
  - parts[0] = "Suite 200"
  - parts[1] = "456 Business Ave"
  - parts[2] = "Downtown"
  - Returns: "456 Business Ave, Downtown" (not optimal)

- **Current Code**:
  ```typescript
  function buildLocationText(place: Place | PlaceDetails, destination: string): string {
    if (!place.formattedAddress) {
      return destination;
    }

    const parts = place.formattedAddress.split(',').map((p) => p.trim());

    if (parts.length >= 3) {
      return `${parts[1]}, ${parts[2]}`;
    } else if (parts.length >= 2) {
      return parts.slice(0, 2).join(', ');
    }

    return place.formattedAddress;
  }
  ```

- **Recommended Fix**:
  Use the last 2-3 parts of the address (which are typically the most important geographically):
  ```typescript
  function buildLocationText(place: Place | PlaceDetails, destination: string): string {
    if (!place.formattedAddress) {
      return destination;
    }

    const parts = place.formattedAddress.split(',').map((p) => p.trim());

    // Use last 2-3 parts which typically contain city/region/country
    if (parts.length >= 3) {
      // For most addresses: [address, neighborhood, city, region, country]
      // Return the last 2 parts (typically city and country/state)
      return parts.slice(-2).join(', ');
    } else if (parts.length >= 2) {
      return parts.slice(0, 2).join(', ');
    }

    return place.formattedAddress;
  }
  ```

---

#### MAJ-2: Candidate Deduplication Inconsistency
- **File**: src/workers/places/worker.ts:315, :397
- **Dimension**: Error Handling & Edge Cases
- **Severity**: Major
- **Description**:
  The worker deduplicates at two different levels with different keys:
  1. Line 315: Deduplicates by `placeId` (prevents duplicate API calls)
  2. Line 397: Deduplicates by `candidateId` (the final output)

  However, since `candidateId` is a hash of `(placeId + name)`, the same place with different names generates different candidates. This defeats the purpose of deduplication and violates the invariant that each physical place appears once in the results.

  **Example scenario**:
  - API returns: `{placeId: "ChIJ123", name: "Tokyo Tower"}`
  - Later in results: `{placeId: "ChIJ123", name: "Tokyo Tower - Landmark"}`
  - First dedup (placeId): Correctly filters the second one
  - Second dedup (candidateId): Both pass through because hashes differ
  - Result: Same place appears twice with different titles

- **Current Code**:
  ```typescript
  // Line 315 - prevent duplicate API calls
  const seenPlaceIds = new Set<string>();
  // ...
  const newPlaces = places.filter((p) => !seenPlaceIds.has(p.placeId));

  // Line 397 - deduplicate final candidates
  const uniqueCandidates = deduplicateCandidates(candidates);

  // In mapper.ts line 169
  const candidateId = createHash('sha256')
    .update(seed)
    .digest('hex')
    .slice(0, 16);
  ```

- **Recommended Fix**:
  Remove the second deduplication by candidateId since the placeId-based deduplication already prevents duplicates:
  ```typescript
  // Line 396-398
  // Remove deduplicateCandidates call since placeId dedup already handles this
  // const uniqueCandidates = deduplicateCandidates(candidates);
  // const finalCandidates = uniqueCandidates.slice(0, assignment.maxResults);

  const finalCandidates = candidates.slice(0, assignment.maxResults);
  ```

  Or, if deduplication by candidateId is desired (to catch API inconsistencies), update the candidateId generation to use only placeId:
  ```typescript
  // In mapper.ts line 169
  const candidateId = place.placeId.slice(0, 16);  // Use place ID directly
  ```

---

#### MAJ-3: Timeout Allocation Doesn't Account for Details Fetching
- **File**: src/workers/places/worker.ts:319-360
- **Dimension**: Error Handling & Edge Cases
- **Severity**: Major
- **Description**:
  The timeout allocation logic doesn't properly account for the time spent fetching place details, which happens within the same query loop. This can cause queries to timeout prematurely.

  **Timeline analysis**:
  ```
  Total timeout: 20s (default)
  Time per query: 20s * 0.7 / 4 queries = 3.5s per query

  Actual usage per iteration:
  1. textSearch() - uses full 3.5s timeout
  2. fetchDetailsForPlaces() - uses SAME 3.5s timeout (but 0+ time already used)
  ```

  The `fetchDetailsForPlaces()` call (line 356-360) receives the same `perQueryTimeout` that was just consumed by `textSearch()`. If `textSearch()` uses 2s, details fetching only has 1.5s remaining, but the timeout isn't reduced.

- **Current Code**:
  ```typescript
  // Lines 319-323
  const totalTimeout = assignment.timeout || DEFAULT_TIMEOUT_MS;
  const perQueryTimeout = Math.floor(
    (totalTimeout * QUERY_TIMEOUT_FRACTION) / Math.max(assignment.queries.length, 1)
  );

  // Line 338-342: uses perQueryTimeout
  const places = await withRetry<Place[]>(() =>
    this.client.textSearch(query, {
      type: queryType,
      timeoutMs: perQueryTimeout,
    })
  );

  // Line 356-360: uses SAME perQueryTimeout
  const detailedPlaces = await this.fetchDetailsForPlaces(
    topPlaces,
    context,
    perQueryTimeout  // <-- Problem: doesn't account for time already used
  );
  ```

- **Recommended Fix**:
  Implement elapsed time tracking:
  ```typescript
  const iterationStartTime = Date.now();

  // After textSearch
  const searchElapsed = Date.now() - iterationStartTime;
  const remainingTimeout = Math.max(100, perQueryTimeout - searchElapsed);

  const detailedPlaces = await this.fetchDetailsForPlaces(
    topPlaces,
    context,
    remainingTimeout
  );
  ```

---

#### MAJ-4: Silent Failure in Detail Fetching Without Retry
- **File**: src/workers/places/worker.ts:448-458
- **Dimension**: Error Handling & Edge Cases
- **Severity**: Major
- **Description**:
  The `fetchDetailsForPlaces()` method silently ignores individual place detail fetch failures without retry logic. This means if a detail fetch fails due to transient errors (quota, timeout), it's immediately lost, while the main query retry loop gets full retry treatment.

  This creates asymmetry: text searches get 3 retries with exponential backoff, but detail fetches get 0 retries. This is especially problematic since detail fetches are optional (we use basic info as fallback), and transient failures should be retried.

- **Current Code**:
  ```typescript
  // Lines 448-458
  for (const place of places) {
    try {
      const details = await withRetry<PlaceDetails>(() =>
        this.client.getPlaceDetails(place.placeId, timeoutMs)
      );
      context.costTracker.addPlacesCall();
      results.push(details);
    } catch {
      // Skip this place on error, use basic info instead
      // Don't record failure for individual detail fetches
    }
  }
  ```

- **Issue**:
  1. Individual detail fetches use `withRetry()`, which is correct
  2. But the catch block silently drops the entire place, when we could fall back to basic info
  3. The comment says "use basic info instead", but the code doesn't do this - it drops the place entirely
  4. This means failures in detail fetching lose candidates that should fall back to basic info

- **Recommended Fix**:
  Don't catch errors in detail fetching - let them propagate so basic info is used:
  ```typescript
  // Remove try-catch, let details fail gracefully with fallback logic
  const detailsMap = new Map<string, PlaceDetails>();

  for (const place of places) {
    try {
      const details = await withRetry<PlaceDetails>(() =>
        this.client.getPlaceDetails(place.placeId, timeoutMs)
      );
      context.costTracker.addPlacesCall();
      detailsMap.set(place.placeId, details);
    } catch {
      // Silently skip - basic info will be used as fallback
    }
  }

  // Then use map to merge details with basic info
  const allPlaces: Array<Place | PlaceDetails> = newPlaces.map(
    p => detailsMap.get(p.placeId) ?? p
  );
  ```

---

### MINOR Issues

#### MIN-1: Score Calculation Doesn't Handle Zero Rating Properly
- **File**: src/workers/places/mapper.ts:503-529
- **Dimension**: Error Handling & Edge Cases
- **Severity**: Minor
- **Description**:
  The score calculation treats rating=0 as "very bad place" (0 points from rating component) rather than "no rating available" (skip rating points). In reality, places with no user ratings (rating undefined) shouldn't receive negative scoring - they should just not get the bonus.

- **Current Code** (lines 507-511):
  ```typescript
  if (place.rating !== undefined) {
    score += Math.min(25, (place.rating / 5) * 25);
  }
  ```

- **Analysis**:
  - If rating is undefined: No points added (correct)
  - If rating is 0: Adds 0 points (correct, but represents "users actively rated it poorly" vs "no users")
  - If rating is 1: Adds 5 points
  - If rating is 5: Adds 25 points

- **Impact**: Minor - relies on API not returning 0 rating for unrated places (it typically returns undefined instead)

- **Recommended Fix** (optional):
  Add explicit handling:
  ```typescript
  if (place.rating !== undefined && place.rating > 0) {
    score += Math.min(25, (place.rating / 5) * 25);
  }
  ```

---

#### MIN-2: Jitter Range May Be Too Aggressive
- **File**: src/workers/places/worker.ts:82-87
- **Dimension**: Architecture & Code Quality
- **Severity**: Minor
- **Description**:
  The exponential backoff jitter is +/-500ms, which is approximately 50% of the base delay (1000ms). This is quite aggressive and could cause very short delays (100ms) or long delays (1500ms) for the first retry.

  PRD Section 17.3.2 specifies "±500ms jitter" but doesn't clarify the intent. For backoff stability, jitter is typically 5-10% of delay, not 50%.

- **Current Code** (line 85):
  ```typescript
  const jitter = (Math.random() * 2 - 1) * JITTER_MS;  // JITTER_MS = 500
  return Math.max(0, exponential + jitter);
  ```

- **Example**:
  - Attempt 0: 1000ms ± 500ms = 500-1500ms
  - Attempt 1: 2000ms ± 500ms = 1500-2500ms
  - Attempt 2: 4000ms ± 500ms = 3500-4500ms

- **Recommended Fix** (optional - verify PRD intent first):
  ```typescript
  // Add comment explaining the aggressive jitter per PRD 17.3.2
  // If this seems too high, consider reducing to ±100ms (10% of base)
  ```

---

#### MIN-3: Missing Validation on API Response Structure
- **File**: src/workers/places/client.ts:489-508
- **Dimension**: Type Safety
- **Severity**: Minor
- **Description**:
  The `parseSearchResults()` function assumes the geometry object with location fields always exists. While the Place interface shows geometry as required, there's no defensive validation. If the API returns malformed data, the code could fail at runtime.

- **Current Code** (lines 490-508):
  ```typescript
  private parseSearchResults(data: TextSearchResponse): Place[] {
    return data.results.map((result) => ({
      // ...
      geometry: {
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      },
      // ...
    }));
  }
  ```

- **Impact**: If geometry is missing, this throws "Cannot read property 'location' of undefined"

- **Recommended Fix** (defensive):
  ```typescript
  private parseSearchResults(data: TextSearchResponse): Place[] {
    return data.results
      .filter(result => result.geometry?.location?.lat != null && result.geometry?.location?.lng != null)
      .map((result) => ({
        // ... rest of mapping
      }));
  }
  ```

---

#### MIN-4: Error Message Loses Original Error Type
- **File**: src/workers/places/worker.ts:105-106, :391
- **Dimension**: Type Safety
- **Severity**: Minor
- **Description**:
  When an error is caught and stored as `lastError`, the original error type information is lost. Converting errors to strings via `String(error)` can produce unhelpful output for non-Error objects.

- **Current Code**:
  ```typescript
  // Line 105-106
  lastError = error instanceof Error ? error : new Error(String(error));

  // Line 391
  lastError = error instanceof Error ? error.message : String(error);
  ```

- **Issue**: `String(error)` produces "[object Object]" for plain objects, losing useful debugging info

- **Recommended Fix**:
  ```typescript
  // Better error handling
  lastError = error instanceof Error
    ? error.message
    : JSON.stringify(error, null, 2);
  ```

---

## Files Reviewed

- src/workers/places/client.ts (592 lines)
- src/workers/places/mapper.ts (530 lines)
- src/workers/places/worker.ts (485 lines)
- src/workers/places/index.ts (47 lines)
- src/workers/places/places.test.ts (1,274 lines)

**Total**: 2,928 lines reviewed

---

## Test Coverage

- **Test Suite**: src/workers/places/places.test.ts
- **Tests Passing**: 68/68 (100%)
- **Coverage**: Comprehensive coverage of:
  - PlacesClient API calls and error handling
  - Mapper functions and type inference
  - Worker planning and execution
  - Helper functions (deduplication, query generation)
  - End-to-end integration scenarios

**Note**: Tests are well-written but don't cover all edge cases identified above (address format variations, timeout edge cases).

---

## Verification Commands

After fixing the issues above, run:

```bash
# TypeScript compilation (already passing)
npm run build

# Unit tests
npm test -- src/workers/places/

# Linting (if applicable)
npm run lint

# Integration test (if available)
npm test -- src/stages/  # Worker execution tests
```

---

## PRD Compliance Checklist

Based on PRD Section 5.2 (Places Worker) and Section 10.2:

- [x] PlacesClient class with API key from env
- [x] textSearch() implementation
- [x] getPlaceDetails() implementation
- [x] API error handling and quota management
- [x] API call counting for cost tracking
- [x] mapPlaceToCandidate() implementation
- [x] SourceRef generation (with format issue - see CRIT-1)
- [x] Rating and price level mapping
- [x] origin='places' and confidence='verified' setting
- [x] PlacesWorker extending Worker interface
- [x] Query generation from session/intent
- [x] Execute() calling API and mapping results
- [x] Detail fetching for top results
- [x] Comprehensive unit tests

---

## Summary

The implementation is **production-ready with caveats**. All tests pass, code is well-structured, and most functionality is correctly implemented. However:

1. **CRITICAL**: Fix the Google Maps URL format (CRIT-1) before release
2. **MAJOR**: Address the four major issues (MAJ-1 through MAJ-4) to improve robustness
3. **MINOR**: The four minor issues can be fixed in a follow-up pass

**Recommendation**: Deploy with fixes for CRIT-1 (URL format) and MAJ-1, MAJ-3 (timeout/location handling). The other issues can be addressed in Phase 0.1 or Phase 1.
