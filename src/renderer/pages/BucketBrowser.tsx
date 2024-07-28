import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';

export const BucketViewer = () => {
  const { bucketName } = useParams();

  return (
    <>
      <h1>Viewing bucket: {bucketName}</h1>
    </>
  );
};
