export interface ChunkOptions<T> {
  chunkSize: number;
  items: T[];
}

export function chunkArray<T>({ items, chunkSize }: ChunkOptions<T>): T[][] {
  const size = Math.max(1, chunkSize);
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
