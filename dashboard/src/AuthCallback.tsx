import { auth } from "@/client";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Component to render at `/auth/callback`.
 *
 * Calls signIn() again to save the token, then puts the user where they were
 * trying to go.
 *
 * THE BUG THIS REPLACED: it navigated to "/" unconditionally. That was right
 * when "/" was the overview, and wrong the moment the landing page moved in
 * there — a successful sign-in dropped the user back on the front door, which
 * is indistinguishable from the sign-in having failed. (Missed when the routes
 * moved because the search was for `to="/"`, the JSX form, and this is the
 * imperative one.)
 *
 * Do not simply point it at /dashboard. The OAuth client already stashes the
 * page that triggered sign-in as `oldUrl` and restores it, which is what makes
 * a shared deep link survive the round trip — someone sent /at-risk should
 * land on /at-risk, not on the overview.
 *
 * But how it restores depends on its `useHistory` setting: with history it
 * calls replaceState, which changes the address bar WITHOUT telling React
 * Router to re-render, leaving this component mounted over the right url.
 * So read where the client left us and route there properly, falling back to
 * the dashboard if it left us here.
 */
function AuthCallback(): React.ReactElement {
  const [error, setError] = useState<string | undefined>(undefined);
  const navigate = useNavigate();

  // This effect conflicts with React 18 strict mode in development
  // https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development
  useEffect(() => {
    auth
      .signIn()
      .then(() => {
        const here = window.location.pathname + window.location.search;
        const stranded = here.startsWith("/auth/callback");
        navigate(stranded ? "/dashboard" : here, { replace: true });
      })
      .catch((e: unknown) => {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError(String(e));
        }
      });
  }, [navigate]);
  return <div>{error != null ? error : "Authenticating…"}</div>;
}

export default AuthCallback;
