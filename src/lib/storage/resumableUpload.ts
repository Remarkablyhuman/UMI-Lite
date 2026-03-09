import { Upload } from 'tus-js-client'
import type { SupabaseClient } from '@supabase/supabase-js'

export function resumableUpload(
  supabase: SupabaseClient,
  bucketName: string,
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return supabase.auth.getSession().then(({ data: { session } }) => {
    return new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session!.access_token}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName,
          objectName: storagePath,
          contentType: file.type || 'video/mp4',
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024, // 6 MB
        onError: reject,
        onProgress: (bytesUploaded, bytesTotal) => {
          onProgress?.(bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0)
        },
        onSuccess: () => resolve(),
      })
      upload.start()
    })
  })
}
