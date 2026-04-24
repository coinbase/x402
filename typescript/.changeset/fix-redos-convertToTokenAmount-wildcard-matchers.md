---
"@x402/core": patch
---

fix(core/utils): harden `convertToTokenAmount` regex against ReDoS-style backtracking and fix wildcard pattern matchers

- **`convertToTokenAmount` (closes #2090):** Replace `/^-?\d+\.?\d*$/` with the non-ambiguous
  `/^-?(?:\d+(?:\.\d*)?)$/`. The old pattern had overlapping quantified digit groups (`\d+` and `\d*`)
  around an optional decimal point that could trigger polynomial backtracking on long non-matching
  strings. The new pattern is structurally unambiguous: the integer part (`\d+`) is required, then
  optionally a decimal point followed by zero or more fractional digits (`(?:\.\d*)?`), with no overlap.

- **`findFacilitatorBySchemeAndNetwork` wildcard matcher (closes #2091):** The pattern-to-regex
  conversion in `utils/index.ts` previously used `String.prototype.replace("*", ".*")` — replacing
  only the first `*` — and did not escape regex metacharacters in the stored pattern, allowing
  metacharacter injection (e.g., a literal `.` in a pattern would act as a regex wildcard). Fixed to
  escape all metacharacters with `replace(/[$()+.?^{|}[\]\\]/g, "\\$&")` before replacing all
  wildcards via `/\*/g`.

- **`x402Facilitator.ts` wildcard matchers (closes #2091):** Both `verify` and `settle` code paths in
  `x402Facilitator.ts` used the same unsafe single-replacement pattern. Both are now fixed with the
  same metacharacter-escape-then-wildcard-expand approach.

New tests cover adversarial ReDoS inputs (long digit strings with non-digit suffix, multiple decimal
points) and wildcard matcher edge cases (metacharacter-in-pattern, multi-wildcard pattern, cross-
namespace non-match).
