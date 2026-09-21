import AtRisk from "@/pages/AtRisk";
import CommunityDetail from "@/pages/CommunityDetail";
import CommunityList from "@/pages/CommunityList";
import AuthCallback from "@/AuthCallback";
import Overview from "@/pages/Overview";
import PropertyDetail from "@/pages/PropertyDetail";
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Overview />,
    },
    {
      path: "/at-risk",
      element: <AtRisk />,
    },
    {
      path: "/communities",
      element: <CommunityList />,
    },
    {
      path: "/community/:slug",
      element: <CommunityDetail />,
    },
    {
      path: "/property/:propertyId",
      element: <PropertyDetail />,
    },
    {
      // This is the route defined in your application's redirect URL
      path: "/auth/callback",
      element: <AuthCallback />,
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
