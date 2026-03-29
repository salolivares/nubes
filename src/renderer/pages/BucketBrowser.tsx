import { useParams } from 'react-router-dom';

export const BucketViewer = () => {
  const { bucketName } = useParams();

  return (
    <div className="p-6 md:p-10">
      <h1>Viewing bucket: {bucketName}</h1>
    </div>
  );
};
