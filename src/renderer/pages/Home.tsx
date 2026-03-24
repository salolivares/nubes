import { Button } from '@client/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/components/ui/dropdown-menu';
import { cn } from '@client/lib/utils';
import {
  ArrowUpDown,
  ChevronRight,
  ImageIcon,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type SortBy = 'name' | 'createdAt' | 'status';

const sortLabels: Record<SortBy, string> = {
  createdAt: 'Date created',
  name: 'Name',
  status: 'Status',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

type PhotosetRow = Awaited<ReturnType<Window['photosets']['list']>>[number];

export const Home = () => {
  const [photosets, setPhotosets] = useState<PhotosetRow[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [loading, setLoading] = useState(true);

  const loadPhotosets = useCallback(async (sort: SortBy) => {
    setLoading(true);
    try {
      const data = await window.photosets.list({
        sortBy: sort,
        sortOrder: sort === 'name' ? 'asc' : 'desc',
      });
      setPhotosets(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotosets(sortBy);
  }, [sortBy, loadPhotosets]);

  const handleSort = (sort: SortBy) => {
    setSortBy(sort);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Photosets</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortLabels[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(sortLabels) as SortBy[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => handleSort(key)}
                className={cn(sortBy === key && 'font-semibold')}
              >
                {sortLabels[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : photosets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-medium">No photosets yet</p>
            <p className="text-sm text-muted-foreground">
              Start by uploading your first set of photos.
            </p>
          </div>
          <Button asChild>
            <Link to="/new" className="gap-2">
              <Plus className="h-4 w-4" />
              New Upload
            </Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border bg-background">
          {photosets.map((photoset) => (
            <Link
              key={photoset.id}
              to={`/photoset/${photoset.id}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              {/* Status dot */}
              <div
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  photoset.status === 'published'
                    ? 'bg-green-500'
                    : 'bg-gray-400'
                )}
              />

              {/* Name and details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {photoset.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {photoset.bucketName}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {photoset.images.length}{' '}
                  {photoset.images.length === 1 ? 'image' : 'images'}
                  {' · '}
                  Created {formatRelativeTime(photoset.createdAt)}
                </p>
              </div>

              {/* Status badge */}
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                  photoset.status === 'published'
                    ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20'
                    : 'bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20'
                )}
              >
                {photoset.status}
              </span>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
};
