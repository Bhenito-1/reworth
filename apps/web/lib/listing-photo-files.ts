const LISTING_PHOTO_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
]);

export function isListingPhotoFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return LISTING_PHOTO_EXT.has(name.slice(dot + 1).toLowerCase());
}

export function filterListingPhotoFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(isListingPhotoFile);
}