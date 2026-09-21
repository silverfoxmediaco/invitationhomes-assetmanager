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
