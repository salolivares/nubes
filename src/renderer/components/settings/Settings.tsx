import { cn } from '@client/lib/utils';
import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [{ name: 'General', href: '/settings' }];

export const Settings = () => {
  const location = useLocation();

  return (
    <>
      <div className="mx-auto grid w-full max-w-6xl gap-2">
        <h1 className="text-3xl font-semibold">Settings</h1>
      </div>
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
        <nav className="grid gap-4 text-sm text-muted-foreground" x-chunk="dashboard-04-chunk-0">
          {links.map(({ href, name }) => (
            <Link
              key={href}
              to={href}
              className={cn(location.pathname === href && 'font-semibold text-primary')}
            >
              {name}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </>
  );
};
