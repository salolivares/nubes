import { useCallback, useEffect } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/button';
import { WizardStep } from '../components/wizard-step';
import { paths } from '../lib/paths';
import { useImageStore } from '../stores/images';

// TODO: move icons to own component

function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
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

function XIcon(props: React.SVGProps<SVGSVGElement>) {
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

export const ImagePicker = () => (
  <WizardStep step="picker">
    {(photoset) => <ImagePickerStep photosetId={photoset.id} />}
  </WizardStep>
);

const ImagePickerStep = ({ photosetId }: { photosetId: number }) => {
  const files = useImageStore((s) => s.files);
  const addFilesFromPaths = useImageStore((s) => s.addFilesFromPaths);
  const removeFile = useImageStore((s) => s.removeFile);
  const removeAllFiles = useImageStore((s) => s.removeAllFiles);
  const unloadPreviews = useImageStore((s) => s.unloadPreviews);
  const clearResults = useImageStore((s) => s.clearResults);

  const navigate = useNavigate();

  const handleUpload = () => {
    // Drop results from an earlier run so the processing step runs on the files picked now.
    clearResults();
    navigate(paths.wizard.upload(photosetId));
  };

  const handleBrowse = useCallback(async () => {
    const entries = await window.imagePicker.open();
    if (entries.length > 0) {
      addFilesFromPaths(entries);
    }
  }, [addFilesFromPaths]);

  const handleDrop = useCallback(
    async (droppedFiles: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        toast.error(
          rejections.length === 1
            ? `Skipped ${rejections[0].file.name}`
            : `Skipped ${rejections.length} files`,
          { description: 'Only JPG and PNG images can be added.' },
        );
      }
      if (droppedFiles.length === 0) return;

      // Queued by path like Browse, so the worker can read them and previews load over
      // nubes-media://. Don't read `file.path`: react-dropzone sets it to the bare file name.
      const { entries, missing } = await window.imagePicker.addDroppedFiles(droppedFiles);
      if (entries.length > 0) addFilesFromPaths(entries);
      if (missing.length > 0) {
        toast.error(
          missing.length === 1
            ? `Couldn't add ${missing[0]}`
            : `Couldn't add ${missing.length} images`,
          {
            description:
              'Nubes can only process images saved on this computer. Save them to a folder first, then drop them from there.',
          },
        );
      }
    },
    [addFilesFromPaths],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // The same formats the Browse dialog allows.
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    noClick: true,
    // Space and Enter would open react-dropzone's own file picker, whose files have no disk path.
    // Browse files is the only way to open a dialog.
    noKeyboard: true,
    onDrop: (files, rejections) => void handleDrop(files, rejections),
  });

  useEffect(() => {
    // Revoke the data uris to avoid memory leaks, will run on unmount
    return () => unloadPreviews();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-10">
      <h1>Upload</h1>
      <div
        {...getRootProps()}
        data-testid="drop-zone"
        className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 transition-colors hover:border-primary/30 hover:bg-muted/30"
      >
        <input {...getInputProps()} />
        <div className="text-center text-muted-foreground">
          <UploadIcon className="mx-auto mb-2 h-8 w-8" />
          {isDragActive ? (
            <p>Drop the files here ...</p>
          ) : (
            <>
              <p>Drag and drop files here</p>
              <Button variant="outline" className="mt-2" onClick={handleBrowse}>
                Browse files
              </Button>
            </>
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
                {file.preview ? (
                  <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
                    <span className="text-xs text-muted-foreground">{file.name}</span>
                  </div>
                )}
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
    </div>
  );
};
