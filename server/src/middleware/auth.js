import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'eigo_quest_secret_key_2026';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '認証トークンがありません。ログインしてください。' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'トークンが無効または期限切れです。' });
    }
    req.user = user;
    next();
  });
}
