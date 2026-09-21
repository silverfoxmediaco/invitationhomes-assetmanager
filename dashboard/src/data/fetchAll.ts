import type { Client } from "@osdk/client";
import type { ObjectTypeDefinition } from "@osdk/api";

/**
 * Fetch every row of an object type, following pagination.
 *
 * The OSDK pages at a default well under our volumes (95,467 rent payments,
 * 81,548 expenses), so anything that reads a whole object type has to loop or
 * it silently shows only the first page. A partial read here is worse than an
 * error, because the dashboard renders a plausible-looking number that is
 * simply wrong.
 *
 * `$select` is not optional at this scale. Properties alone is 16 columns
 * across 2,997 rows; asking for the four the caller actually uses is the
 * difference between a fast screen and a slow one.
 *
 * `maxRows` is a guard rather than a feature. Nothing on the overview should be
 * pulling a six-figure object type into the browser — if a caller trips this,
 * the query belongs on the server or behind a filter, not paged harder.
 *
 * The caller states the row shape as `T`, because `$select` is passed as a
 * runtime string array and the OSDK's own return type cannot narrow to it
 * without threading its generics through every call site. That makes `T` a
 * claim rather than a guarantee: if a select list and its type drift apart,
 * TypeScript will not catch it.
 */
export async function fetchAll<T>(
  client: Client,
  objectType: ObjectTypeDefinition,
  options: { select?: readonly string[]; pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const { select, pageSize = 1000, maxRows = 50_000 } = options;

  const out: T[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const args: Record<string, unknown> = { $pageSize: pageSize };
    if (select) {args.$select = select;}
    if (nextPageToken) {args.$nextPageToken = nextPageToken;}

    // The args are built at runtime from `select`, so they cannot be typed
    // against this object type's own property union without making every
    // caller pass its generics explicitly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await client(objectType).fetchPage(args as any);
    out.push(...(page.data as T[]));
    nextPageToken = page.nextPageToken;

    if (out.length >= maxRows) {
      throw new Error(
        `fetchAll exceeded maxRows (${maxRows}). This object type is too large ` +
          `to pull into the browser — filter it or aggregate server-side.`
      );
    }
  } while (nextPageToken);

  return out;
}
