import { Link } from "react-router-dom";
import { Sun, Moon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

interface TopbarProps {
  pathname: string;
}

const breadcrumbs: Record<string, string> = {
  "/brands": "Brands",
  "/brands/create": "Create Brand",
};

export function Topbar({ pathname }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();

  const title = Object.entries(breadcrumbs).find(([key]) => pathname.startsWith(key))?.[1] ?? "Dashboard";

  return (
    <header className="flex items-center justify-between border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
      <div>
        <p className="text-sm text-muted-foreground">Brand Mention Tracker</p>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
          <Link to="https://github.com">Feedback</Link>
        </Button>
      </div>
    </header>
  );
}
