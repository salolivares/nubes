import { trpc } from '@client/lib/trpc';

function FolderIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export const Home = () => {
  const { data } = trpc.bucket.list.useQuery();

  return (
    <>
      <h1>Select a folder to begin</h1>
      <div>
        {data?.map((bucket) => (
          <div
            className="group flex flex-col items-center justify-center gap-2 bg-muted rounded-lg p-4 hover:bg-muted/60 transition-colors cursor-pointer"
            key={bucket.Name}
          >
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <FolderIcon className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium">{bucket.Name}</span>
          </div>
        ))}
      </div>
    </>
  );
};
