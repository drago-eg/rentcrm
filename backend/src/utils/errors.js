export class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode || 500;
    this.code = code || 'INTERNAL_ERROR';
    this.details = details;
  }
}

export function badRequest(message, details = null, code = 'VALIDATION_ERROR') {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'جلسة غير مصرح بها، يرجى تسجيل الدخول.', code = 'UNAUTHORIZED') {
  return new AppError(401, code, message);
}

export function forbidden(message = 'ليس لديك صلاحية تنفيذ هذا الإجراء.', code = 'FORBIDDEN') {
  return new AppError(403, code, message);
}

export function notFound(message = 'العنصر المطلوب غير موجود.', code = 'NOT_FOUND') {
  return new AppError(404, code, message);
}

export function conflict(message = 'السجل مكرر بالفعل.', details = null, code = 'DUPLICATE_RECORD') {
  return new AppError(409, code, message, details);
}

export function serviceUnavailable(message = 'خدمة قاعدة البيانات غير متاحة حاليًا.', code = 'SERVICE_UNAVAILABLE') {
  return new AppError(503, code, message);
}
