import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

interface SidebarProps {
  items: {
    label: string;
    to: string;
    icon: ComponentType<{ className?: string }>;
  }[];
  title?: string;
}

export function Sidebar({ items, title }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-64 border-r border-border bg-card/60 p-6 md:flex md:flex-col">
      <div className="mb-8">
        <div className="flex items-center gap-3 text-xl font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            BM
          </div>
          <span>{title ?? "Brand Monitor"}</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
