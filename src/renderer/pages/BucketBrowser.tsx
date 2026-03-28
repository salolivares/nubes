import { useParams } from 'react-router-dom';

export const BucketViewer = () => {
  const { bucketName } = useParams();

  return (
    <>
      <h1>Viewing bucket: {bucketName}</h1>
    </>
  );
};
