import dotenv from 'dotenv';

dotenv.config();

export function getEnvConfig() {
  const port = Number(process.env.PORT || 3000);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret =
    process.env.JWT_SECRET ||
    (nodeEnv === 'production'
      ? ''
      : 'rg-crm-dev-only-jwt-secret-change-in-production');

  const gasWebAppUrl = String(process.env.GAS_WEB_APP_URL || '').trim();
  const gasApiSecret = String(process.env.GAS_API_SECRET || '').trim();
  const rgApiToken = String(process.env.RG_API_TOKEN || process.env.RENTAL_TOKEN || '')
    .trim()
    .replace(/^Bearer\s+/i, '');

  const corsOriginRaw = String(process.env.CORS_ORIGIN || '*').trim();
  const corsOrigins =
    corsOriginRaw === '*'
      ? '*'
      : corsOriginRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  return {
    port,
    nodeEnv,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    gasWebAppUrl,
    gasApiSecret,
    rgApiToken,
    rgReservationsApi:
      process.env.RG_RESERVATIONS_API || 'https://api.rentalgate.net/api/reservations/filter',
    rgExtendsApi:
      process.env.RG_EXTENDS_API || 'https://api.rentalgate.net/api/reservation-extends/filter',
    corsOrigins,
  };
}
