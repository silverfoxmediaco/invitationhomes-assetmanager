import AtRisk from "@/pages/AtRisk";
import AuthCallback from "@/AuthCallback";
import Collections from "@/pages/Collections";
import CommunityDetail from "@/pages/CommunityDetail";
import CommunityList from "@/pages/CommunityList";
import Layout from "@/components/Layout";
import Leasing from "@/pages/Leasing";
import Maintenance from "@/pages/Maintenance";
import Overview from "@/pages/Overview";
import PropertyDetail from "@/pages/PropertyDetail";
import PropertyList from "@/pages/PropertyList";
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: "/", element: <Overview /> },
        { path: "/properties", element: <PropertyList /> },
        { path: "/property/:propertyId", element: <PropertyDetail /> },
        { path: "/communities", element: <CommunityList /> },
        { path: "/community/:slug", element: <CommunityDetail /> },
        { path: "/collections", element: <Collections /> },
        { path: "/leasing", element: <Leasing /> },
        { path: "/at-risk", element: <AtRisk /> },
        { path: "/maintenance", element: <Maintenance /> },
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
