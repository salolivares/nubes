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
  const [error, setError] = useState<string | null>(null);

  const loadPhotosets = useCallback(async (sort: SortBy) => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.photosets.list({
        sortBy: sort,
        sortOrder: sort === 'name' ? 'asc' : 'desc',
      });
      setPhotosets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photosets');
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
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadPhotosets(sortBy)}>
            Retry
          </Button>
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
        <ul className="divide-y divide-border">
          {photosets.map((photoset) => (
            <li key={photoset.id} className="relative">
            <Link
              to={`/photoset/${photoset.id}`}
              className="flex items-center space-x-4 px-4 py-4 sm:px-6 lg:px-8"
            >
              {/* Upload status dot */}
              <div
                className={cn(
                  'flex-none rounded-full p-1',
                  photoset.uploadedAt
                    ? 'text-green-500 bg-green-500/10'
                    : 'text-gray-400 bg-gray-100 dark:bg-gray-400/10'
                )}
              >
                <div className="size-2 rounded-full bg-current" />
              </div>

              {/* Name and details */}
              <div className="min-w-0 flex-auto">
                <div className="flex items-center gap-x-3">
                  <h2 className="min-w-0 text-sm/6 font-semibold text-foreground">
                    <span className="flex gap-x-2">
                      <span className="truncate">{photoset.name}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {photoset.bucketName}
                      </span>
                    </span>
                  </h2>
                </div>
                <div className="mt-3 flex items-center gap-x-2.5 text-xs/5 text-muted-foreground">
                  <p className="truncate">
                    {photoset.images.length}{' '}
                    {photoset.images.length === 1 ? 'image' : 'images'}
                  </p>
                  <svg viewBox="0 0 2 2" className="size-0.5 flex-none fill-muted-foreground/50">
                    <circle r={1} cx={1} cy={1} />
                  </svg>
                  <p className="whitespace-nowrap">
                    Created {formatRelativeTime(photoset.createdAt)}
                  </p>
                </div>
              </div>

              {/* Upload status badge */}
              <div
                className={cn(
                  'flex-none rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset',
                  photoset.uploadedAt
                    ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20'
                    : 'bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20'
                )}
              >
                {photoset.uploadedAt ? 'uploaded' : 'draft'}
              </div>

              <ChevronRight className="size-5 flex-none text-muted-foreground" />
            </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
