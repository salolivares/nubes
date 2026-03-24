import { useParams } from 'react-router-dom';

export const PhotosetDetail = () => {
  const { photosetId } = useParams<{ photosetId: string }>();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Photoset #{photosetId}
      </h1>
      <p className="text-sm text-muted-foreground">Detail view coming soon.</p>
    </div>
  );
};
