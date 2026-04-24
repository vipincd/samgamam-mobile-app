export const EVENT_PHOTO_MAX_BYTES = 6 * 1024 * 1024;

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

export type PickedPhotoAsset = {
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uri: string;
};

export type ValidatedPickedPhoto =
  | {
      asset: {
        fileName: string;
        fileSize?: number | null;
        mimeType: string;
        uri: string;
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

function extensionFromName(value: string | null | undefined) {
  const match = value?.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
  return match?.[1] ?? null;
}

function mimeFromExtension(extension: string | null) {
  switch (extension) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function fallbackName(asset: PickedPhotoAsset, extension: string | null) {
  const safeExtension = allowedExtensions.has(extension ?? '') ? extension : 'jpg';
  return `samgamam-memory.${safeExtension}`;
}

export function validatePickedEventPhoto(asset: PickedPhotoAsset): ValidatedPickedPhoto {
  const nameExtension = extensionFromName(asset.fileName);
  const uriExtension = extensionFromName(asset.uri);
  const extension = nameExtension ?? uriExtension;
  const mimeType = asset.mimeType ?? mimeFromExtension(extension);

  if (!extension || !allowedExtensions.has(extension)) {
    return {
      message: 'Choose a jpg, png, or webp photo.',
      ok: false,
    };
  }

  if (!mimeType || !allowedMimeTypes.has(mimeType)) {
    return {
      message: 'Samgamam can upload jpg, png, and webp images only.',
      ok: false,
    };
  }

  if (asset.fileSize && asset.fileSize > EVENT_PHOTO_MAX_BYTES) {
    return {
      message: 'Choose a photo under 6 MB.',
      ok: false,
    };
  }

  return {
    asset: {
      fileName: asset.fileName || fallbackName(asset, extension),
      fileSize: asset.fileSize,
      mimeType,
      uri: asset.uri,
    },
    ok: true,
  };
}

export function resolvePhotoUri(apiBaseUrl: string, imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  const normalizedPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
