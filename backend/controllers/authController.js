import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { JWT_SECRET, TVA_AUTH_URL, BCRYPT_ROUNDS } from '../config/constants.js';

export const registerUser = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const u = new User({ username, passwordHash: hash, displayName });
    await u.save();

    const token = jwt.sign({ userId: u._id, username: u.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: u.username, displayName: u.displayName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { username, password, employeeId } = req.body;
    const loginId = (employeeId || username || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Missing credentials' });

    // ── Step 1: TVA Timesheet Auth ─────────────────────────────────────────
    if (TVA_AUTH_URL) {
      try {
        const tvaResp = await fetch(`${TVA_AUTH_URL}/api/auth/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ employeeId: loginId, password }),
          signal:  AbortSignal.timeout(8000)
        });

        if (tvaResp.ok) {
          const tvaData = await tvaResp.json();
          const tv = tvaData.user;

          let user = await User.findOne({ username: tv.employeeId });
          if (!user) {
            user = new User({
              username:     tv.employeeId,
              passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
              displayName:  tv.name,
              employeeId:   tv.employeeId,
              email:        tv.email || null,
              tvaRole:      tv.role,
              teamLead:     tv.teamLead || null,
              tvaProfile:   tv
            });
            await user.save().catch(() => {});
          } else {
            user.displayName = tv.name;
            user.email       = tv.email || user.email;
            user.tvaRole     = tv.role;
            user.teamLead    = tv.teamLead || null;
            user.tvaProfile  = tv;
            await user.save().catch(() => {});
          }

          const token = jwt.sign(
            { userId: user._id, username: tv.employeeId, displayName: tv.name, role: tv.role, tvaProfile: tv },
            JWT_SECRET,
            { expiresIn: '24h' }
          );
          return res.json({ token, username: tv.employeeId, displayName: tv.name, role: tv.role, tvaProfile: tv });
        }

        if (tvaResp.status === 401) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
      } catch (tvaErr) {
        console.warn('[TVA Auth] Unreachable, falling back to local auth:', tvaErr.message);
      }
    }

    return res.status(401).json({
      error: TVA_AUTH_URL
        ? 'Timesheet server unreachable. Please try again.'
        : 'Authentication service not configured. Contact your administrator.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMe = async (req, res) => {
  try {
    if (req.user.tvaProfile) {
      return res.json({
        userId:      req.user.userId,
        username:    req.user.username,
        displayName: req.user.displayName,
        role:        req.user.role,
        tvaProfile:  req.user.tvaProfile
      });
    }
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      userId:      user._id,
      username:    user.username,
      displayName: user.displayName,
      role:        user.tvaRole || 'employee',
      tvaProfile:  user.tvaProfile || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
