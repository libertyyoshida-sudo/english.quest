import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';

const router = Router();

// ユーザー登録
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください。' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'このユーザー名は既に使用されています。' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
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
    res.json({ token, user: { id: user.id, username: user.username, profile: user.profile } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'ユーザー登録処理に失敗しました。' });
  }
});

// ログイン
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { username },
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
    res.json({ token, user: { id: user.id, username: user.username, profile: user.profile } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログイン処理に失敗しました。' });
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
      profile: user.profile,
      userItems: user.userItems,
      userTitles: user.userTitles,
    });
  } catch (error) {
    res.status(500).json({ error: 'ユーザー情報の取得に失敗しました。' });
  }
});

export default router;
