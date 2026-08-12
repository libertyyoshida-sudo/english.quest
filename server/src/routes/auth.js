import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';

const router = Router();

function normalizeUsername(username) {
  return String(username || '').trim();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    profile: user.profile,
  };
}

// ユーザー登録
router.post('/register', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'ユーザー名、メールアドレス、パスワードを入力してください。' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'メールアドレスの形式を確認してください。' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'パスワードは4文字以上にしてください。' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existingUser) {
      const field = existingUser.username === username ? 'ユーザー名' : 'メールアドレス';
      return res.status(400).json({ error: `この${field}は既に使用されています。` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        profile: {
          create: {
            totalExp: 0,
            level: 1,
            gold: 0,
            currentHp: 20,
            maxCombo: 0,
            hasPerfect: false,
            equippedWeaponId: 'w1',
            equippedArmorId: 'a1',
          },
        },
        userItems: {
          create: [
            { itemId: 'w1', isEquipped: true },
            { itemId: 'a1', isEquipped: true },
          ],
        },
      },
      include: { profile: true },
    });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'ユーザー登録処理に失敗しました。' });
  }
});

// ログイン
router.post('/login', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email: normalizeEmail(username) },
        ],
      },
      include: { profile: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません。' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません。' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログイン処理に失敗しました。' });
  }
});

// パスワード再設定（メール送信サービス未導入のため、登録メール照合で再設定）
router.post('/reset-password', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const newPassword = String(req.body.newPassword || '');

    if (!username || !email || !newPassword) {
      return res.status(400).json({ error: 'ユーザー名、登録メールアドレス、新しいパスワードを入力してください。' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'メールアドレスの形式を確認してください。' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: '新しいパスワードは4文字以上にしてください。' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.email !== email) {
      return res.status(400).json({ error: 'ユーザー名と登録メールアドレスが一致しません。' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ message: 'パスワードを再設定しました。新しいパスワードでログインしてください。' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'パスワード再設定処理に失敗しました。' });
  }
});

// 現在のユーザー情報取得
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        profile: true,
        userItems: true,
        userTitles: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      profile: user.profile,
      userItems: user.userItems,
      userTitles: user.userTitles,
    });
  } catch (error) {
    res.status(500).json({ error: 'ユーザー情報の取得に失敗しました。' });
  }
});

export default router;
