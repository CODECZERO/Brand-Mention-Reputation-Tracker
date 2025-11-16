import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeywordInputProps {
  value: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
}

export function KeywordInput({ value, onChange, placeholder }: KeywordInputProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed.toLowerCase()]);
    setDraft("");
  };

  const removeKeyword = (keyword: string) => {
    onChange(value.filter((item) => item !== keyword));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder ?? "Press enter to add keyword"}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commitDraft();
            } else if (event.key === "Backspace" && !draft && value.length) {
              removeKeyword(value[value.length - 1]);
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={commitDraft} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((keyword) => (
          <Badge key={keyword} variant="secondary" className="flex items-center gap-2">
            <span className="capitalize">{keyword}</span>
            <button type="button" onClick={() => removeKeyword(keyword)} className="text-xs text-muted-foreground">
              ×
            </button>
          </Badge>
        ))}
        {value.length === 0 && <span className="text-xs text-muted-foreground">No keywords added yet.</span>}
      </div>
    </div>
  );
}
