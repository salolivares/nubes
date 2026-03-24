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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden bg-muted/30 ring-1 ring-border">
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
        <nav className="flex-1 px-4 pt-4">
          <ul className="-mx-2 space-y-1">
            {navLinks.map(({ name, href, icon: Icon }) => {
              const isActive =
                href === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(href);

              return (
                <li key={href}>
                  <Link
                    to={href}
                    className={cn(
                      'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-6 shrink-0',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom controls */}
        <div className="-mx-6 mt-auto border-t px-6 py-3">
          <ModeToggle />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-h-screen flex-1 flex-col pl-72">
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
