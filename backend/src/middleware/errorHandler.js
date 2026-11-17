import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `المسار غير موجود: ${req.method} ${req.originalUrl}`,
    data: null,
    error: 'NOT_FOUND',
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      data: err.details || null,
      error: err.code,
    });
  }

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'حجم الملف المرفوع يتجاوز الحد المسموح به (10 ميجابايت).',
      data: null,
      error: 'FILE_TOO_LARGE',
    });
  }

  console.error('[Backend Error]', err);
  return res.status(500).json({
    success: false,
    message: err?.message || 'حدث خطأ داخلي غير متوقع في الخادم.',
    data: null,
    error: 'INTERNAL_SERVER_ERROR',
  });
}
