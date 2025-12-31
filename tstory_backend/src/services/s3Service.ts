import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function uploadImageToS3(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<UploadResult> {
  try {
    // 파일 확장자 추출
    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';

    // 고유한 파일명 생성 (UUID + 타임스탬프)
    const timestamp = Date.now();
    const uniqueId = uuidv4().slice(0, 8);
    const fileName = `images/${timestamp}-${uniqueId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);

    // 퍼블릭 URL 생성
    const url = `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${fileName}`;

    console.log(`Image uploaded successfully: ${url}`);

    return {
      success: true,
      url,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
