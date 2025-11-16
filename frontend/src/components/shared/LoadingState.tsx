export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
