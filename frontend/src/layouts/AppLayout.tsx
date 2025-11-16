import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { appNavItems } from "@/lib/navigation";

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-muted/20 text-foreground">
      <Sidebar items={appNavItems} title="Brand Tracker" />
      <div className="flex flex-1 flex-col">
        <Topbar pathname={location.pathname} />
        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
