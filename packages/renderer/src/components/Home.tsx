import { trpc } from '@/lib/trpc';

export const Home = () => {
  const userQuery = trpc.users.useQuery();

  return (
    <>
      <h1>Home</h1>
      <div>{userQuery.data?.map((user) => <div key={user.id}>{user.name}</div>)}</div>
    </>
  );
};
