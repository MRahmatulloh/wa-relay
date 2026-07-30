import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/** HTTP Basic Auth against the users collection (username + passwordHash). */
export async function basicAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const challenge = () => {
    res.set('WWW-Authenticate', 'Basic realm="WA Relay QR"');
    return res.status(401).type('text').send('Authentication required');
  };

  if (!header.startsWith('Basic ')) {
    return challenge();
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    const username = (colon >= 0 ? decoded.slice(0, colon) : decoded).trim().toLowerCase();
    const password = colon >= 0 ? decoded.slice(colon + 1) : '';
    if (!username || !password) {
      return challenge();
    }

    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return challenge();
    }

    req.user = user;
    next();
  } catch {
    return challenge();
  }
}
