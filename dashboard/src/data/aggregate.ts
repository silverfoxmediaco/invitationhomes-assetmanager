import { auth, foundryUrl, ontologyRid } from "@/client";

/**
 * Server-side aggregation, because some questions should never be answered by
 * pulling rows into a browser.
 *
 * Rent collection is monthly totals over 95,663 payments. Fetching those to
 * add them up in JavaScript would breach the row guard in fetchAll, and would
 * deserve to: the sum is three numbers per month and Foundry can compute it
 * where the data already is. One request returns 165 groups — 36 months by 5
 * payment statuses — instead of eight megabytes of individual payments.
 *
 * It is addressed by URL rather than through the OSDK because @osdk/client
 * 2.70 ships no aggregation wrapper; the generated SDK exposes fetchPage and
 * where, and nothing else. The auth client is the same one the OSDK uses, so
 * this borrows its token rather than holding credentials of its own.
 *
 * The response carries an `accuracy` field. Foundry will quietly return
 * APPROXIMATE results on large or high-cardinality groupings, and an
 * approximate collection rate presented as an exact one is the kind of wrong
 * number this project keeps finding. So anything other than ACCURATE throws.
 */

export interface AggregationGroup<G extends Record<string, string>> {
  group: G;
  metrics: Record<string, number>;
}

type Metric =
  | { type: "sum" | "avg" | "min" | "max"; field: string; name: string }
  | { type: "count"; name: string };

type GroupBy =
  | { field: string; type: "exact" }
  | { field: string; type: "duration"; value: number; unit: "MONTHS" | "DAYS" | "YEARS" };

export async function aggregate<G extends Record<string, string>>(
  objectType: string,
  aggregation: Metric[],
  groupBy: GroupBy[],
  where?: Record<string, unknown>
): Promise<AggregationGroup<G>[]> {
  const token = await auth();
  const body: Record<string, unknown> = { aggregation, groupBy };
  if (where) {
    body.where = where;
  }

  const response = await fetch(
    `${foundryUrl}/api/v2/ontologies/${ontologyRid}/objects/${objectType}/aggregate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Aggregation on ${objectType} failed (${response.status}). ${detail.slice(0, 300)}`
    );
  }

  const payload = (await response.json()) as {
    accuracy?: string;
    excludedItems?: number;
    data?: { group: G; metrics: { name: string; value: number }[] }[];
  };

  if (payload.accuracy && payload.accuracy !== "ACCURATE") {
    throw new Error(
      `Foundry returned ${payload.accuracy} results for ${objectType}. A collection rate ` +
        `shown to two decimal places must not be an estimate — narrow the grouping.`
    );
  }

  return (payload.data ?? []).map((row) => ({
    group: row.group,
    metrics: Object.fromEntries(row.metrics.map((m) => [m.name, m.value])),
  }));
}
