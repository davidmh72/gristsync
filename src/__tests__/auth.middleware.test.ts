import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { verifyWebhookSignature } from '../middleware/auth.middleware';

describe('Auth Middleware - verifyWebhookSignature', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  const secret = process.env.WEBHOOK_SECRET || 'super_secure_master_webhook_secret_here';

  beforeEach(() => {
    req = {
      params: { tenantId: 'test-tenant' },
      headers: {},
      body: { test: 'payload' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    delete process.env.NODE_ENV;
  });

  it('allows request when valid tokenHeader is provided', () => {
    req.headers = { 'x-webhook-token': secret };
    verifyWebhookSignature(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows request when valid HMAC signature is provided', () => {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    req.headers = { 'x-webhook-signature': computedSignature };
    verifyWebhookSignature(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects request with 401 when signature is invalid', () => {
    req.headers = { 'x-webhook-signature': 'invalid_signature_hex' };
    verifyWebhookSignature(req as Request, res as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects request with 401 when no headers are provided', () => {
    verifyWebhookSignature(req as Request, res as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
