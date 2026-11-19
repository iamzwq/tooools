import { convertSvg } from '@/features/export-image/convert';
import { EXPORT_IMAGE_RASTERIZE, type RasterizeMessage, type RasterizeResponse } from '@/features/export-image/messages';
import { blobToDataUrl } from '@/lib/image';
import { onMessage } from '@/utils/messaging';

onMessage<RasterizeMessage, RasterizeResponse>(EXPORT_IMAGE_RASTERIZE, async ({ dataUrl, format, quality, background }) => {
  try {
    return { dataUrl: await blobToDataUrl(await convertSvg(dataUrl, format, { quality, background })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});
