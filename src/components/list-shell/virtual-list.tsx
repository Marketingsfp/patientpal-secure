import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface VirtualListProps<T> {
  items: ReadonlyArray<T>;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  itemClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
  onEndReached?: () => void;
  endThresholdPx?: number;
  emptyState?: ReactNode;
}

/**
 * Lista virtualizada baseada em @tanstack/react-virtual.
 * Renderiza somente linhas visíveis. Dispara onEndReached quando faltam
 * `endThresholdPx` do fim (para scroll infinito).
 */
export function VirtualList<T>({
  items, estimateSize = 44, overscan = 8, className, itemClassName,
  renderItem, getKey, onEndReached, endThresholdPx = 400, emptyState,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const handleScroll = () => {
    if (!onEndReached || !parentRef.current) return;
    const el = parentRef.current;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - endThresholdPx) {
      onEndReached();
    }
  };

  if (items.length === 0 && emptyState) {
    return <div className={cn("h-full flex items-center justify-center", className)}>{emptyState}</div>;
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className={cn("relative h-full w-full overflow-auto", className)}
    >
      <div style={{ height: totalSize, width: "100%", position: "relative" }}>
        {virtualRows.map((vr) => {
          const item = items[vr.index];
          const key = getKey ? getKey(item, vr.index) : vr.index;
          return (
            <div
              key={key}
              data-index={vr.index}
              ref={rowVirtualizer.measureElement}
              className={cn("absolute left-0 top-0 w-full", itemClassName)}
              style={{ transform: `translateY(${vr.start}px)` }}
            >
              {renderItem(item, vr.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}