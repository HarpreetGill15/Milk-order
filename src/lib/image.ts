/** Longest side sent to Claude: the most it reads at full detail, enough for a full screen of rows. */
export const MAX_IMAGE_EDGE = 2576

/** Shrinks a photo to MAX_IMAGE_EDGE (respecting EXIF rotation) and returns it as base64 JPEG. */
export async function prepareImage(blob: Blob): Promise<{ data: string; mediaType: 'image/jpeg'; previewUrl: string }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', previewUrl: dataUrl }
}
