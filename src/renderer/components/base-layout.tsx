import { Home, Package2, Plus, Settings } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { DebugBar } from './debug-bar';
import { RouteErrorFallback } from './error-fallback';
import { ModeToggle } from './mode-toggle';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from './ui/sidebar';

const navLinks = [
  { name: 'Photosets', href: '/', icon: Home },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function BaseLayout() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex flex-row items-center gap-2 p-4">
          <Package2 />
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">Nubes</span>
        </SidebarHeader>

        <SidebarContent>
          {/* New Upload CTA */}
          <div className="px-4 pb-4">
            <Button render={<Link to="/new" />} nativeButton={false} className="w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
              <Plus data-icon="inline-start" />
              <span className="group-data-[collapsible=icon]:hidden">New Upload</span>
            </Button>
          </div>

          {/* Nav links */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navLinks.map(({ name, href, icon: Icon }) => {
                  const isActive =
                    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        render={<Link to={href} />}
                        isActive={isActive}
                        tooltip={name}
                      >
                        <Icon />
                        <span>{name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <ModeToggle />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <main className="flex flex-1 flex-col gap-4 overflow-auto p-6 md:p-10">
          <ErrorBoundary FallbackComponent={RouteErrorFallback} resetKeys={[location.pathname]}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <DebugBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
