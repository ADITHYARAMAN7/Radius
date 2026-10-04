import { ImageAnnotatorClient } from '@google-cloud/vision';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';

let client: ImageAnnotatorClient | null = null;

function getVisionClient() {
  if (!client) {
    client = new ImageAnnotatorClient();
  }
  return client;
}

export async function moderateImage(buffer: Buffer): Promise<void> {
  try {
    const vision = getVisionClient();
    const [result] = await vision.safeSearchDetection(buffer);
    const safeSearch = result.safeSearchAnnotation;

    if (!safeSearch) {
      return; // Could not detect, allow by default
    }

    const { adult, violence, racy } = safeSearch;

    const blockList = ['LIKELY', 'VERY_LIKELY'];

    if (
      blockList.includes(String(adult || '')) ||
      blockList.includes(String(violence || '')) ||
      blockList.includes(String(racy || ''))
    ) {
      logger.warn('Image moderation failed', { safeSearch });
      throw AppError.badRequest(
        'This image violates our community guidelines. Please choose a different photo.'
      );
    }
  } catch (error) {
    // If it's our own AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }
    
    // For general API errors, log them but allow the upload so we don't break the app if Vision is down
    logger.error('Vision API error during image moderation', { error });
  }
}
