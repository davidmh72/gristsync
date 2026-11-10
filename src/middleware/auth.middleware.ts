import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const MASTER_WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'super_secure_master_webhook_secret_here';

export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.params.tenantId;
  const signatureRaw = req.headers['x-webhook-signature'] || req.headers['x-mailchimp-signature'];
  const signatureHeader = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
  const tokenRaw = req.headers['x-webhook-token'];
  const tokenHeader = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  // 1. Check custom bearer/token header if configured per tenant
  if (tokenHeader && tokenHeader === MASTER_WEBHOOK_SECRET) {
    return next();
  }

  // 2. Validate HMAC SHA-256 signature if signature header is provided
  if (signatureHeader && req.body) {
    const computedSignature = crypto
      .createHmac('sha256', MASTER_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader);
    const computedBuffer = Buffer.from(computedSignature);

    if (
      signatureBuffer.length === computedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      return next();
    }
  }

  // Fallback check for development or trusted direct webhooks (can be tightened for production hardening)
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // If neither matches, reject unauthorized request immediately
  res.status(401).json({
    status: 'error',
    message: 'Unauthorized: Invalid or missing webhook signature/token verification headers.',
  });
  return;
}
