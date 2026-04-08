import { cn } from '@client/lib/utils';
import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [
  { name: 'General', href: '/settings' },
  { name: 'Cameras', href: '/settings/cameras' },
  { name: 'Storage', href: '/settings/storage' },
];

export const Settings = () => {
  const location = useLocation();

  return (
    <div className="flex flex-col gap-4 p-6 md:p-10">
      <div className="mx-auto grid w-full max-w-6xl gap-2">
        <h1>Settings</h1>
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
    </div>
  );
};
