import type { Request, Response, NextFunction } from 'express';

const requestsByIp = new Map<string, { count: number; windowStart: number }>();

export function simpleRateLimit(maxPerMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const existing = requestsByIp.get(ip);

    if (!existing || now - existing.windowStart > 60_000) {
      requestsByIp.set(ip, { count: 1, windowStart: now });
      return next();
    }

    if (existing.count >= maxPerMinute) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    existing.count += 1;
    requestsByIp.set(ip, existing);
    return next();
  };
}

export function requireTermsAccepted(req: Request, res: Response, next: NextFunction) {
  const accepted = req.headers['x-terms-accepted'];
  if (accepted !== 'true') {
    return res.status(400).json({ error: 'Terms must be accepted before downloading' });
  }

  return next();
}
