import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type BrandListResponse } from "@/types/api";

interface BrandTableProps {
  brands: BrandListResponse;
}

export function BrandTable({ brands }: BrandTableProps) {
  if (brands.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>No brands created yet.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to="/brands/create">Create your first brand</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="min-w-full divide-y divide-border bg-card">
        <thead className="bg-muted/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Brand</th>
            <th className="px-4 py-3">Keywords</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-sm">
          {brands.map((brand) => (
            <tr key={brand.slug} className="transition hover:bg-muted/40">
              <td className="px-4 py-4 font-medium text-foreground">{brand.name}</td>
              <td className="px-4 py-4 text-muted-foreground">—</td>
              <td className="px-4 py-4 text-muted-foreground">
                {brand.createdAt ? new Date(brand.createdAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link to={`/brands/${brand.slug}/dashboard`}>View Dashboard</Link>
                  </Button>
                  <Button variant="ghost" size="sm" disabled>
                    Delete unavailable
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
