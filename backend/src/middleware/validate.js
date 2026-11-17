import { badRequest } from '../utils/errors.js';

export function validateBody(validatorFn) {
  return (req, _res, next) => {
    try {
      const result = validatorFn(req.body || {});
      if (Array.isArray(result) && result.length > 0) {
        return next(badRequest(result[0], result));
      }
      if (typeof result === 'string' && result) {
        return next(badRequest(result));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
