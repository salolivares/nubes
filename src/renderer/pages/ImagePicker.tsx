import { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/button';
import type { CustomFile } from '../stores/images';
import { useImageStoreSelectors } from '../stores/images';

// TODO: file dialog does not work. see react drop zone docs.
// TODO: move icons to own component

function UploadIcon(props) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function XIcon(props) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export const ImagePicker = () => {
  const { files, addFiles, removeFile, removeAllFiles, unloadPreviews } = useImageStoreSelectors();

  const navigate = useNavigate();

  const handleUpload = () => {
    navigate('../upload', { relative: 'path' });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': [],
    },
    onDrop: (acceptedFiles) => {
      addFiles(acceptedFiles as CustomFile[]);
    },
  });

  useEffect(() => {
    // Revoke the data uris to avoid memory leaks, will run on unmount
    return () => unloadPreviews();
  }, []);

  return (
    <>
      <h1>Upload</h1>
      <div
        {...getRootProps()}
        className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 transition-colors hover:border-primary/30 hover:bg-muted/30 cursor-pointer"
      >
        <input {...getInputProps()} />
        <div className="text-center text-muted-foreground">
          <UploadIcon className="mx-auto mb-2 h-8 w-8" />
          {isDragActive ? (
            <p>Drop the files here ...</p>
          ) : (
            <p>Drag and drop files here or click to upload</p>
          )}
        </div>
      </div>
      {files.length > 0 && (
        <div className="grid gap-4">
          <div>
            <h3>Queued for upload</h3>
            <Button onClick={removeAllFiles}>Clear</Button>
            <Button onClick={handleUpload}>Upload</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {files.map((file, index) => (
              <div key={index} className="relative group rounded-md overflow-hidden aspect-square">
                <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeFile(index)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="w-4 h-4" />
                  <span className="sr-only">Remove image</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
