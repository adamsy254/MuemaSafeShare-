// Local Session-Scoped File Cache to resolve actual raw files that were uploaded in the current session.
// This ensures that when a user uploads an image, audio, or video, its actual content is loaded
// instantly in the browser, bypassing any sandbox storage limits and eliminating upload latency.

import { FileMetadata } from './types';

class LocalCacheManager {
  private fileCache: Map<string, File> = new Map();
  private objectUrls: Map<string, string> = new Map();

  public registerFile(fileId: string, file: File) {
    this.fileCache.set(fileId, file);
    const objectUrl = URL.createObjectURL(file);
    this.objectUrls.set(fileId, objectUrl);
  }

  public getRawFile(fileId: string): File | undefined {
    return this.fileCache.get(fileId);
  }

  public getResolvedUrl(file: FileMetadata): string {
    const objectUrl = this.objectUrls.get(file.fileId);
    if (objectUrl) {
      return objectUrl;
    }
    return file.url;
  }

  public cleanup() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.fileCache.clear();
  }
}

export const localCache = new LocalCacheManager();
