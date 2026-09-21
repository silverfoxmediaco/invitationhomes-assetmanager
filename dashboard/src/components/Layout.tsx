import React from "react";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";

/** Every screen except the OAuth callback sits under the header. The callback
 *  is excluded on purpose: it renders for a moment mid-redirect and has no
 *  business drawing branding. */
function Layout(): React.ReactElement {
  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  );
}

export default Layout;
