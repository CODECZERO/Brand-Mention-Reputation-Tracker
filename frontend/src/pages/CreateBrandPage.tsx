import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { KeywordInput } from "@/components/shared/KeywordInput";
import { LoadingState } from "@/components/shared/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBrand } from "@/hooks/useBrands";
import { type CreateBrandRequest } from "@/types/api";

export default function CreateBrandPage() {
  const navigate = useNavigate();
  const mutation = useCreateBrand();

  const [brandName, setBrandName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!brandName.trim() || keywords.length === 0) {
      setNotes("Brand name and at least one keyword are required.");
      return;
    }

    const payload: CreateBrandRequest = {
      brandName: brandName.trim(),
      keywords,
    };

    mutation.mutate(payload, {
      onSuccess: (response) => {
        setNotes("Brand created successfully!");
        navigate(`/brands/${response.slug}/dashboard`);
      },
      onError: (error) => {
        setNotes(error.message);
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Create a brand</h2>
        <p className="text-sm text-muted-foreground">
          This form calls <code>POST /api/brands</code> with the brand name and keywords array.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Brand details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="brandName">
                Brand name
              </label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="Company or product name"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Keywords</label>
              <KeywordInput value={keywords} onChange={setKeywords} placeholder="Add keywords" />
              <p className="text-xs text-muted-foreground">
                Keywords help the backend fetch mentions. Include variations, hashtags, or product lines.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="notes">
                Internal notes (optional)
              </label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional memo for collaborators"
              />
            </div>

            {mutation.isPending && <LoadingState message="Creating brand..." />}

            {mutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{mutation.error?.message ?? "Unable to create brand"}</AlertDescription>
              </Alert>
            )}

            {mutation.isSuccess && !mutation.isPending && (
              <Alert>
                <AlertTitle>Brand created</AlertTitle>
                <AlertDescription>Redirecting to dashboard...</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Save brand
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
