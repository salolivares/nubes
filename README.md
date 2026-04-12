# Nubes

<img width="500" align="right" alt="Nubes photoset view" src="https://github.com/user-attachments/assets/bae49d6d-bb05-48d2-a196-ffc33f6c155f" />

An app to enable a *very* opinionated workflow for processing images for my [website](https://salolivares.com/photos).

Basically you drop some images, it converts them to various sizes of webp and jpg, and then it generates a markdown file with the images and their metadata. That gets uploaded to a s3 bucket, which then my website reads and displays[^1].

Built with Electron, React, TypeScript.

---

```bash
nvm use
pnpm install
pnpm start
```

<br>
<br>
<br>

[^1]: Still need to update astro collections to read the new images from s3. so working on automating that somehow.
