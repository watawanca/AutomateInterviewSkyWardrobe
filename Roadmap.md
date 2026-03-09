1. Lock the architecture now
- Keep your TS backend + frontend split.
- Make backend the only layer that calls weather APIs.
- Frontend only calls your backend (`/api/recommendation`).

2. Implement the core endpoint first
- Add `GET /api/recommendation?lat=...&lon=...`.
- Backend flow:
  - Fetch live weather (`temperature`, `humidity`, `precipitation`).
  - Classify weather state via threshold rules.
  - Map state to outfit items from local JSON.
  - Return recommendation payload.

3. Add a local clothing dataset
- Create something like `data/clothing.json` with categories:
  - tops, bottoms, outerwear, shoes, accessories
  - tags/constraints (`cold`, `rainy`, `humid`, etc.)

4. Build the recommendation engine
- Add deterministic threshold logic (explicit and testable), e.g.:
  - `cold < 10`, `chilly 10-17`, `mild 18-25`, `hot > 25`
  - rain based on precipitation probability/amount
  - humidity comfort bands
- Map these states to outfit rules.

5. Add resiliency (required in brief)
- If API fails/rate-limits:
  - Use short-lived cache of last good weather result.
  - If no cache, return a safe default recommendation + `"source": "fallback"`.

6. Add minimal tests before UI polish
- Unit tests for threshold classification and outfit mapping.
- One integration test for fallback behavior.

7. Then wire UI
- Show weather summary + “Outfit of the Day” + whether result is live/fallback.