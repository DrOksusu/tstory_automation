import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadImageToS3 } from '../services/s3Service';

const router = Router();

// Multer 설정 - 메모리에 저장 (S3로 직접 업로드)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 최대 10MB
  },
  fileFilter: (req, file, cb) => {
    // 이미지 파일만 허용
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)'));
    }
  },
});

/**
 * 이미지 업로드
 * POST /upload/image
 */
router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: '이미지 파일이 필요합니다.',
      });
      return;
    }

    const result = await uploadImageToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        message: '이미지가 업로드되었습니다.',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || '이미지 업로드에 실패했습니다.',
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

export default router;
