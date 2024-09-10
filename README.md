# Nubes

An app to enable a *very* opinionated workflow for processing images for my [website](https://salolivares.com/photos).

Basically you drop some images, it converts them to various sizes of webp and jpg, and then it generates a markdown file with the images and their metadata. That gets uploaded to a s3 bucket, which then my website reads and displays[^1].

Built with Electron, React, TypeScript.


[^1]: Still need to update astro collections to read the new images from s3. so working on automating that somehow.
