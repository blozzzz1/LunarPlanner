import { get, set } from 'idb-keyval';

const CACHE_PREFIX = 'moon-tile-';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getTileFromCache(url: string): Promise<Blob | null> {
  try {
    const cacheKey = CACHE_PREFIX + url;
    const cached = await get(cacheKey);
    
    if (!cached) return null;
    
    const { data, timestamp } = cached;
    
    // Check if cache has expired
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      return null;
    }
    
    return new Blob([data], { type: 'image/png' });
  } catch (error) {
    console.warn('Error reading from tile cache:', error);
    return null;
  }
}

export async function saveTileToCache(url: string, blob: Blob): Promise<void> {
  try {
    const cacheKey = CACHE_PREFIX + url;
    const arrayBuffer = await blob.arrayBuffer();
    
    await set(cacheKey, {
      data: arrayBuffer,
      timestamp: Date.now()
    });
  } catch (error) {
    console.warn('Error saving to tile cache:', error);
  }
}