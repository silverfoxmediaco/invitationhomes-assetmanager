import { useCallback, useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import { MarketStrategy, setMarketStrategy } from "@invitation-homes-asset-management/sdk";
import { fetchAll } from "./fetchAll";

/**
 * Which markets leadership holds as core and which it has marked to exit.
 *
 * This is the one thing in the app that WRITES to Foundry. The exit list used
 * to live in the page URL, which meant two people looking at the Dispositions
 * page could be looking at two different sale packages. Here it is an
 * ontology object per market, changed only through the Set Market Strategy
 * action, which stamps the user and time itself. The browser never sets
 * updatedBy or updatedAt; a client that could would make the audit trail
 * a matter of trust.
 */

export type Strategy = "core" | "exit";

export interface MarketStrategyRow {
  marketId: string;
  strategy: Strategy;
  note: string;
  updatedAt: string;
}

type Row = { marketId: string; strategy: string; note?: string; updatedAt?: string };

export function useMarketStrategy(): {
  strategies: Map<string, MarketStrategyRow>;
  loading: boolean;
  error: Error | null;
  saving: string | null;
  setStrategy: (marketId: string, strategy: Strategy) => Promise<void>;
} {
  const client = useOsdkClient();
  const [strategies, setStrategies] = useState(new Map<string, MarketStrategyRow>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchAll<Row>(client, MarketStrategy, {
      select: ["marketId", "strategy", "note", "updatedAt"],
    });
    setStrategies(
      new Map(
        rows.map((r) => [
          r.marketId,
          {
            marketId: r.marketId,
            strategy: r.strategy === "exit" ? "exit" : "core",
            note: r.note ?? "",
            updatedAt: r.updatedAt ? String(r.updatedAt) : "",
          },
        ])
      )
    );
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const setStrategy = useCallback(
    async (marketId: string, strategy: Strategy) => {
      setSaving(marketId);
      setError(null);
      try {
        await client(setMarketStrategy).applyAction({
          marketStrategy: marketId,
          strategy,
          note: strategies.get(marketId)?.note ?? "",
        });
        // Read back from Foundry rather than trusting the local toggle: the
        // page should show what was saved, including the time Foundry stamped.
        await load();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setSaving(null);
      }
    },
    [client, load, strategies]
  );

  return { strategies, loading, error, saving, setStrategy };
}
