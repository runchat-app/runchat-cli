// A tiny, dependency-free argv parser plus the value coercion the generic tool
// dispatcher relies on. Kept pure (no fs / no network) so it is trivially
// testable — see test/args.test.js.

export interface ParsedArgs {
  /** Positional arguments, in order (flags removed). */
  positionals: string[];
  /** Flag values. Repeated flags collect into an array of strings. */
  flags: Record<string, string | boolean | string[]>;
}

/** Normalise a flag name: strip leading dashes, map kebab-case to snake_case so
 *  `--runchat-id` and `--runchat_id` are the same arg (the API uses snake_case). */
export function normalizeFlag(name: string): string {
  return name.replace(/^--?/, "").replace(/-/g, "_");
}

/**
 * Parse argv (already sliced past `node script`). Long flags only:
 *   --key value        → flags.key = "value"
 *   --key=value        → flags.key = "value"
 *   --flag             → flags.flag = true   (boolean, when no value follows)
 *   --key a --key b    → flags.key = ["a","b"]
 *   --                 → everything after is treated as positionals
 * Anything not starting with `--` is a positional.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  let onlyPositionals = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (onlyPositionals || !token.startsWith("--")) {
      if (token === "--") {
        onlyPositionals = true;
        continue;
      }
      positionals.push(token);
      continue;
    }

    if (token === "--") {
      onlyPositionals = true;
      continue;
    }

    let key: string;
    let value: string | boolean;

    const eq = token.indexOf("=");
    if (eq !== -1) {
      key = normalizeFlag(token.slice(0, eq));
      value = token.slice(eq + 1);
    } else {
      key = normalizeFlag(token);
      const next = argv[i + 1];
      // A following token that isn't a flag becomes this flag's value;
      // otherwise the flag is a standalone boolean.
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }

    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      flags[key] = [String(existing), String(value)];
    }
  }

  return { positionals, flags };
}

/**
 * Smart-coerce a raw string flag value into a JSON value.
 *
 * - `'{"a":1}'` / `'[1,2]'` / `true` / `false` / `null` / `12.5` → parsed JSON
 * - everything else (e.g. `gpt-4`, a UUID, prose) → the string unchanged
 *
 * A round-trip guard keeps id-like strings intact: `"007"` and `"123abc"`
 * stay strings rather than silently becoming numbers. Use `--json` on the
 * command for full, unambiguous control over the argument object.
 */
export function coerceValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return raw;

  // Only attempt JSON for tokens that plausibly start one. This avoids parsing
  // bare words and keeps the common "string" case fast and predictable.
  const first = trimmed[0];
  const looksJson =
    first === "{" ||
    first === "[" ||
    first === '"' ||
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    /^-?\d/.test(trimmed);

  if (!looksJson) return raw;

  try {
    const parsed = JSON.parse(trimmed);
    // Guard numbers: if re-serialising changes the text, the original carried
    // information JSON would drop (leading zeros, oversized ints) — keep it.
    if (typeof parsed === "number" && String(parsed) !== trimmed) return raw;
    return parsed;
  } catch {
    return raw;
  }
}
