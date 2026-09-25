import { Request, Response, NextFunction } from 'express';
import nacl from 'tweetnacl';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Extend Express Request to carry the raw body buffer needed for Ed25519 verification.
 * The raw body is captured via `express.raw()` before any JSON parsing.
 */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/**
 * Middleware: capture raw request body buffer.
 * Must be applied BEFORE any JSON body parser on the interactions route.
 *
 * Usage:
 *   router.post('/interactions', captureRawBody, verifyDiscordSignature, ...)
 */
export function captureRawBody(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    // Also parse JSON into req.body for downstream handlers
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      req.body = JSON.parse(req.rawBody.toString('utf-8'));
    } catch {
      req.body = {};
    }
    next();
  });

  req.on('error', next);
}

/**
 * Middleware: verify Discord Ed25519 signature.
 *
 * Discord signs every interaction request with:
 *   signature = Ed25519(timestamp + body, applicationPrivateKey)
 *
 * We verify using the application PUBLIC KEY.
 *
 * Security rules:
 * - Must use the RAW request body (not re-stringified JSON).
 * - Must verify BEFORE any business logic.
 * - Invalid/missing signatures → HTTP 401.
 * - Never log the public key.
 */
export function verifyDiscordSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  // Missing headers → reject immediately
  if (!signature || !timestamp) {
    logger.warn('Discord signature headers missing', {
      operation: 'discord_sig_verify',
      status: 'rejected',
      reason: 'missing_headers',
    });
    res.status(401).json({ error: 'Missing signature headers' });
    return;
  }

  if (typeof signature !== 'string' || typeof timestamp !== 'string') {
    res.status(401).json({ error: 'Invalid signature headers' });
    return;
  }

  // Verify timestamp freshness to protect against replay attacks (5 minute window)
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes

  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > MAX_TIMESTAMP_AGE_SECONDS) {
    logger.warn('Discord signature timestamp expired or invalid', {
      operation: 'discord_sig_verify',
      status: 'rejected',
      reason: 'invalid_timestamp',
      timestamp,
    });
    res.status(401).json({ error: 'Invalid request timestamp' });
    return;
  }

  if (!req.rawBody) {
    logger.error('Raw body not available for signature verification', {
      operation: 'discord_sig_verify',
      status: 'error',
    });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  try {
    const publicKeyBytes = Buffer.from(config.discord.publicKey, 'hex');
    const signatureBytes = Buffer.from(signature, 'hex');
    const messageBytes = Buffer.concat([
      Buffer.from(timestamp, 'utf-8'),
      req.rawBody,
    ]);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes,
    );

    if (!isValid) {
      logger.warn('Discord signature verification failed', {
        operation: 'discord_sig_verify',
        status: 'rejected',
        reason: 'invalid_signature',
      });
      res.status(401).json({ error: 'Invalid request signature' });
      return;
    }

    logger.debug('Discord signature verified', {
      operation: 'discord_sig_verify',
      status: 'ok',
    });

    next();
  } catch (err) {
    logger.error('Signature verification error', {
      operation: 'discord_sig_verify',
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(401).json({ error: 'Signature verification failed' });
  }
}
