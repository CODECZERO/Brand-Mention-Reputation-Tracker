import { Link } from "react-router-dom";

import { BrandTable } from "@/components/brands/BrandTable";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrands } from "@/hooks/useBrands";

export default function BrandListPage() {
  const { data, isLoading, isError, error } = useBrands();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Brands</h2>
          <p className="text-sm text-muted-foreground">
            Manage tracked brands and jump into their dashboards.
          </p>
        </div>
        <Button asChild>
          <Link to="/brands/create">Create brand</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">API overview</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="grid gap-2 sm:grid-cols-2">
            <li><code>GET /api/brands/current</code> → current tracked brand</li>
            <li><code>POST /api/brands/set</code> → set brand</li>
            <li><code>GET /api/brands/:id/summary</code> → summary snapshot</li>
            <li><code>GET /api/brands/:id/analytics</code> → analytics overview</li>
          </ul>
        </CardContent>
      </Card>

      {isLoading && <LoadingState message="Fetching brands..." />}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {error?.message ?? "Unable to load brands."}
          </CardContent>
        </Card>
      )}

      {data && <BrandTable brands={data} />}
    </div>
  );
}
