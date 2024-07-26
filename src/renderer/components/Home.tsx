import { trpc } from '@client/lib/trpc';

export const Home = () => {
  const { data } = trpc.bucket.list.useQuery();

  return (
    <>
      <h1>Home</h1>
      <div>
        {data?.map((bucket) => (
          <div key={bucket.Name}>{bucket.Name}</div>
        ))}
      </div>
    </>
  );
};
