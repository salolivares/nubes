import { cn } from '@client/lib/utils';
import { Home, Package2, Plus, Settings } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { DebugBar } from './debug-bar';
import { RouteErrorFallback } from './error-fallback';
import { ModeToggle } from './mode-toggle';
import { Button } from './ui/button';

const navLinks = [
  { name: 'Photosets', href: '/', icon: Home },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function BaseLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen w-full">
      {/* Fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Package2 className="h-6 w-6" />
          <span className="text-lg font-semibold">Nubes</span>
        </div>

        {/* New Upload CTA */}
        <div className="px-4 pt-4">
          <Button asChild className="w-full gap-2">
            <Link to="/new">
              <Plus className="h-4 w-4" />
              New Upload
            </Link>
          </Button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-4 pt-4">
          {navLinks.map(({ name, href, icon: Icon }) => {
            const isActive =
              href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(href);

            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="border-t px-4 py-3">
          <ModeToggle />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-h-screen flex-1 flex-col pl-64">
        <main className="flex flex-1 flex-col gap-4 bg-muted/40 p-6 md:p-10">
          <ErrorBoundary
            FallbackComponent={RouteErrorFallback}
            resetKeys={[location.pathname]}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
        <DebugBar />
      </div>
    </div>
  );
}
