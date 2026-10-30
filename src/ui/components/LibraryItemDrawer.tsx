import React from 'react';
import { Sheet } from './Sheet';
import { LibraryItem } from './LibraryItemCard';
import { Button } from './Button';

interface LibraryItemDrawerProps {
  item: LibraryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullEditor: (itemId: string) => void;
}

export const LibraryItemDrawer: React.FC<LibraryItemDrawerProps> = ({
  item,
  isOpen,
  onClose,
  onOpenFullEditor,
}) => {
  if (!item) return null;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={item.title}>
      <div className="flex flex-col h-full justify-between space-y-6 p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-xs uppercase font-semibold text-muted-foreground">
              Type: <strong className="text-foreground">{item.type}</strong>
            </span>
            <span className="text-xs text-muted-foreground">Last updated {item.updatedAt}</span>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview</h4>
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-foreground/90 leading-relaxed font-sans">
              {item.snippet || 'No preview text available for this item.'}
            </div>
          </div>

          {item.tags && item.tags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button variant="default" className="flex-1" onClick={() => onOpenFullEditor(item.id)}>
            Open in Editor
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
