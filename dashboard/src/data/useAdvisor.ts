import { useEffect, useState } from "react";
import { auth, foundryUrl, ontologyRid } from "@/client";

/**
 * The AI advisor: an AIP Logic function reasoning over figures this dashboard
 * has already computed.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the model reasons over the SAME numbers
 * the reader can see. It is not given the ontology to query for itself.
 *
 * If the panel cites $1,352,880 and the page above it shows $1,352,880, both
 * are trusted. If the model ran its own query and landed a few thousand off —
 * a different comp month, a different window, different rounding — the screen
 * loses credibility, and it loses it in front of a client. So the snapshot is
 * assembled from the page hooks' own output and the prompt forbids inventing
 * anything beyond it.
 *
 * ON WHAT IS AND IS NOT SYNTHETIC: the model does not learn from this data, it
 * reasons at query time over the ontology's descriptions. So it would behave
 * identically against real data — the capability transfers, only the inputs
 * are generated. That is the opposite of the trained-model trap recorded in
 * ontology-spec.md, where a model could only recover the generator's own rules.
 *
 * NOT CONFIGURED IS A FIRST-CLASS STATE. The function has to be built in AIP
 * Logic, published, and added to the SDK before this returns anything. Until
 * then the panel says exactly that rather than failing, because a blank box
 * with a spinner tells the next person nothing about what is missing.
 */

export type Confidence = "high" | "medium" | "low";

export interface Suggestion {
  title: string;
  rationale: string;
  impact: string;
  impactBasis: string;
  confidence: Confidence;
  horizon: string;
  /** One of the four action types, or null when nothing executes it. */
  action: string | null;
  /** `kind` is deliberately a loose string. The model returned "portfolio" on
   *  the first live run — a sensible answer nobody had listed — and a union
   *  type would have thrown that suggestion away rather than rendering it
   *  without a link. Unknown kinds render as plain text. */
  target: { kind: string | null; id: string } | null;
}

export interface AdvisorResult {
  suggestions: Suggestion[];
  notes?: string;
}

export type AdvisorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unconfigured"; detail: string }
  | { status: "error"; detail: string }
  | { status: "ready"; result: AdvisorResult; snapshot: AdvisorSnapshot };

/** The figures handed to the model. Mirrors aip-logic-spec.md exactly. */
export interface AdvisorSnapshot {
  asOfMonth: string;
  today: string;
  portfolio: Record<string, number>;
  communities: Record<string, unknown>;
  residents: Record<string, unknown>;
  leasing: Record<string, unknown>;
  collections: Record<string, unknown>;
  maintenance: Record<string, unknown>;
}

const FUNCTION_API_NAME = "portfolioAdvisor";

/**
 * Called by URL rather than through the generated SDK.
 *
 * The SDK only exposes what has been added under Ontology SDK → Resources and
 * regenerated. Addressing the function directly means the panel works the
 * moment the function is published, and keeps a missing function as a clean
 * 404 we can report rather than a TypeScript compile error that blocks the
 * whole app from building. Swap to the generated binding once it is in the SDK
 * and the version is pinned.
 */
async function callAdvisor(snapshot: AdvisorSnapshot): Promise<AdvisorResult> {
  const token = await auth();
  const response = await fetch(
    `${foundryUrl}/api/v2/ontologies/${ontologyRid}/queries/${FUNCTION_API_NAME}/execute`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parameters: { snapshot: JSON.stringify(snapshot) } }),
    }
  );

  if (response.status === 404) {
    throw new NotConfigured(
      `No function named "${FUNCTION_API_NAME}" is published on this ontology.`
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Advisor call failed (${response.status}). ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { value?: unknown };
  const raw = payload.value;

  // The function returns JSON as a string. Parsing is where a model that
  // ignored "no markdown fence" shows up, so the failure says so plainly
  // rather than surfacing a bare SyntaxError.
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(stripFence(raw)) : raw;
  } catch {
    throw new Error(
      "The advisor returned something that is not JSON. Check the Logic block's " +
        "output — the prompt asks for a bare JSON object with no markdown fence."
    );
  }

  const result = parsed as Partial<AdvisorResult>;
  if (!result || !Array.isArray(result.suggestions)) {
    throw new Error("The advisor returned JSON with no `suggestions` array.");
  }

  return {
    suggestions: result.suggestions.filter((s) => s && typeof s.title === "string"),
    notes: typeof result.notes === "string" ? result.notes : undefined,
  };
}

class NotConfigured extends Error {}

/** Models fence JSON out of habit even when told not to. Cheaper to tolerate
 *  here than to keep re-tuning the prompt over it. */
function stripFence(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export function useAdvisor(snapshot: AdvisorSnapshot | null): {
  state: AdvisorState;
  rerun: () => void;
} {
  const [state, setState] = useState<AdvisorState>({ status: "idle" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const result = await callAdvisor(snapshot);
        if (!cancelled) {
          setState({ status: "ready", result, snapshot });
        }
      } catch (e) {
        if (cancelled) {
          return;
        }
        if (e instanceof NotConfigured) {
          setState({ status: "unconfigured", detail: e.message });
        } else {
          setState({
            status: "error",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshot, nonce]);

  return { state, rerun: () => setNonce((n) => n + 1) };
}
