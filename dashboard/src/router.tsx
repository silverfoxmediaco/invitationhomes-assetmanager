import AtRisk from "@/pages/AtRisk";
import AuthCallback from "@/AuthCallback";
import Collections from "@/pages/Collections";
import CommunityDetail from "@/pages/CommunityDetail";
import CommunityList from "@/pages/CommunityList";
import Landing from "@/landing/Landing";
import Layout from "@/components/Layout";
import Leasing from "@/pages/Leasing";
import Maintenance from "@/pages/Maintenance";
import Overview from "@/pages/Overview";
import PropertyDetail from "@/pages/PropertyDetail";
import PropertyList from "@/pages/PropertyList";
import Scenario from "@/pages/Scenario";
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter(
  [
    {
      // Public. Touches no data and triggers no authentication, so the link is
      // openable by anyone — every other route reads the ontology on mount and
      // would bounce a first-time visitor straight to a consent dialog.
      path: "/",
      element: <Landing />,
    },
    {
      element: <Layout />,
      children: [
        { path: "/dashboard", element: <Overview /> },
        { path: "/properties", element: <PropertyList /> },
        { path: "/property/:propertyId", element: <PropertyDetail /> },
        { path: "/communities", element: <CommunityList /> },
        { path: "/community/:slug", element: <CommunityDetail /> },
        { path: "/collections", element: <Collections /> },
        { path: "/leasing", element: <Leasing /> },
        { path: "/at-risk", element: <AtRisk /> },
        { path: "/maintenance", element: <Maintenance /> },
        { path: "/scenario", element: <Scenario /> },
      ],
    },
    {
      // This is the route defined in your application's redirect URL
      path: "/auth/callback",
      element: <AuthCallback />,
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
