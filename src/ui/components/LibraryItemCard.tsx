import React from 'react';
import { cn } from '../lib/cn';

export interface LibraryItem {
  id: string;
  title: string;
  type: 'note' | 'paper' | 'concept';
  updatedAt: string;
  snippet?: string;
  tags?: string[];
  masteryScore?: number;
}

interface LibraryItemCardProps {
  item: LibraryItem;
  viewMode?: 'grid' | 'list';
  isSelected?: boolean;
  onClick: (item: LibraryItem) => void;
  onAction?: (action: 'edit' | 'delete' | 'open', item: LibraryItem) => void;
}

export const LibraryItemCard: React.FC<LibraryItemCardProps> = ({
  item,
  viewMode = 'grid',
  isSelected = false,
  onClick,
  onAction,
}) => {
  const isList = viewMode === 'list';

  const getTypeBadge = (type: LibraryItem['type']) => {
    switch (type) {
      case 'paper':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'concept':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'note':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div
      onClick={() => onClick(item)}
      className={cn(
        'group relative cursor-pointer rounded-xl border bg-card p-4 transition-all duration-200 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5',
        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60',
        isList ? 'flex items-center justify-between gap-4 py-3' : 'flex flex-col justify-between space-y-3'
      )}
    >
      <div className={cn('flex flex-col space-y-1.5', isList && 'flex-1 min-w-0')}>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wider',
              getTypeBadge(item.type)
            )}
          >
            {item.type}
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {item.title}
          </h3>
        </div>

        {item.snippet && (
          <p className={cn('text-xs text-muted-foreground line-clamp-2', isList && 'line-clamp-1')}>
            {item.snippet}
          </p>
        )}
      </div>

      <div className={cn('flex items-center gap-3', isList ? 'shrink-0' : 'justify-between pt-2 border-t border-border/40')}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.masteryScore !== undefined && (
            <span className="font-mono text-xs font-semibold text-primary">
              {item.masteryScore}%
            </span>
          )}
          <span className="text-[11px] whitespace-nowrap">{item.updatedAt}</span>
        </div>
      </div>
    </div>
  );
};
