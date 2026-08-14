export type SkylineItem = {
  id: string;
  start: number;
  end: number;
  height: number;
  sort: number;
  tiebreak: string;
};

export type SkylinePacked<T extends SkylineItem> = T & { top: number };

export function packSkyline<T extends SkylineItem>(
  items: T[],
  columnCount: number,
  gap: number,
): SkylinePacked<T>[] {
  const fill = Array.from({ length: columnCount }, () => 0);
  const sorted = [...items].sort((a, b) => a.sort - b.sort || a.tiebreak.localeCompare(b.tiebreak));

  return sorted.map(item => {
    const start = Math.max(0, Math.min(item.start, columnCount - 1));
    const end = Math.max(start, Math.min(item.end, columnCount - 1));
    let top = 0;
    for (let column = start; column <= end; column += 1) {
      top = Math.max(top, fill[column] ?? 0);
    }
    const bottom = top + Math.max(0, item.height) + gap;
    for (let column = start; column <= end; column += 1) {
      fill[column] = bottom;
    }
    return { ...item, top };
  });
}
