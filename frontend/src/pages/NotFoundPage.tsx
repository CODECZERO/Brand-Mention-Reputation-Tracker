import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 text-center">
      <div>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">404</p>
        <h2 className="text-3xl font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you were looking for could not be located. It may have been removed or renamed.
        </p>
      </div>
      <Button asChild>
        <Link to="/brands">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to brands
        </Link>
      </Button>
    </div>
  );
}
