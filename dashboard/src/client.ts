import { createClient, type Client } from "@osdk/client";
import { createPublicOauthClient, type PublicOauthClient } from "@osdk/oauth";

function getMetaTagContent(tagName: string): string {
  const elements = document.querySelectorAll(`meta[name="${tagName}"]`);
  const element = elements.item(elements.length - 1);
  const value = element ? element.getAttribute("content") : null;
  if (value == null || value === "") {
    throw new Error(`Meta tag ${tagName} not found or empty`);
  }
  if (value.match(/%.+%/)) {
    throw new Error(
      `Meta tag ${tagName} contains placeholder value. Please add ${value.replace(
        /%/g,
        ""
      )} to your .env files`
    );
  }
  return value;
}

/** Exported because the aggregation endpoint has no OSDK wrapper in 2.70 and
 *  has to be addressed by URL. See data/aggregate.ts. */
export const foundryUrl = getMetaTagContent("osdk-foundryUrl");
const clientId = getMetaTagContent("osdk-clientId");
const redirectUrl = getMetaTagContent("osdk-redirectUrl");
export const ontologyRid = getMetaTagContent("osdk-ontologyRid");

const scopes = [
  "api:use-ontologies-read",
  "api:use-ontologies-write",
  "api:use-mediasets-read",
  "api:use-mediasets-write",
];

const rawAuth: PublicOauthClient = createPublicOauthClient(
  clientId,
  foundryUrl,
  redirectUrl,
  { scopes }
);

/**
 * Workaround for a bug in @osdk/oauth 1.14.0 that strands a browser tab in a
 * permanent sign-in failure. Diagnosed on a previous Foundry project; the same
 * version ships here.
 *
 * What goes wrong: createPublicOauthClient writes { codeVerifier, state,
 * oldUrl } into sessionStorage before redirecting to Foundry.
 * maybeHandleAuthReturn only clears them in its CATCH block, so a SUCCESSFUL
 * callback leaves them behind. signOut clears localStorage but not
 * sessionStorage.
 *
 * A stale codeVerifier is not inert. On the next signIn the library sees one
 * present and treats the CURRENT url as an auth callback, so it validates a
 * url with no ?state and throws `response parameter "state" missing`.
 * initiateLoginRedirect never runs, because the one path that could recover is
 * the path the stale state blocks. sessionStorage survives reloads, so the tab
 * stays broken until it is closed.
 *
 * It reads as intermittent: a fresh tab always works, a tab held across a
 * sign-out never does.
 *
 * The retry is the part that matters. Clearing on success stops new tabs
 * breaking; clearing and retrying on that specific error is the only thing
 * that heals a tab, or a shared link, that is already poisoned.
 */
const OAUTH_SESSION_KEY = `@osdk/oauth : refresh : ${clientId}`;

function clearOauthSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(OAUTH_SESSION_KEY);
  } catch {
    // Private mode or blocked storage. Nothing to clear, nothing to report.
  }
}

function isStalePkceError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e ?? "");
  return /parameter "?state"? missing|state.*missing/i.test(message);
}

export const auth: PublicOauthClient = Object.assign(
  async function signIn(...args: Parameters<PublicOauthClient>) {
    try {
      const token = await rawAuth(...args);
      clearOauthSession();
      return token;
    } catch (e) {
      if (!isStalePkceError(e)) {
        throw e;
      }
      clearOauthSession();
      return await rawAuth(...args);
    }
  } as PublicOauthClient,
  rawAuth
);

/**
 * Sign out, and clear the half of the session the library leaves behind.
 *
 * `auth.signOut()` clears localStorage. It does NOT clear the sessionStorage
 * entry holding the PKCE codeVerifier — the same omission documented at length
 * above. Signing out and back in inside one tab is therefore the exact
 * sequence that poisons it: the stale verifier makes the next signIn treat the
 * current url as an auth callback, and it throws `response parameter "state"
 * missing` on a url that has no state to find.
 *
 * The retry wrapper on `auth` would heal that on the second attempt, but a
 * sign-out that knowingly leaves a landmine for sign-in is not a sign-out.
 * Clear both.
 */
export async function signOut(): Promise<void> {
  try {
    await auth.signOut();
  } finally {
    // Runs even if signOut throws. A failed sign-out that left the token in
    // place would be worse if it also left the session key.
    clearOauthSession();
  }
}

/**
 * Initialize the client to interact with the Ontology and Platform SDKs
 */
export const client: Client = createClient(foundryUrl, ontologyRid, auth);

export default client;
