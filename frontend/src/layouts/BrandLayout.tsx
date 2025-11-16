import { NavLink, Outlet, useParams } from "react-router-dom";

import { useBrand } from "@/hooks/useBrands";
import { brandNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export default function BrandLayout() {
  const { brandId = "" } = useParams();
  const { data: brand, isLoading } = useBrand(brandId);

  const navItems = brandId ? brandNavItems(brandId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Brand Dashboard</p>
            <h2 className="text-2xl font-semibold">
              {isLoading ? "Loading brand..." : brand?.name ?? brandId ?? "Unknown brand"}
            </h2>
          </div>
          <div className="text-xs text-muted-foreground">Slug: {(brand?.slug ?? brandId) || "n/a"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
