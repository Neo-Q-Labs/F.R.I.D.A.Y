import { FormatTemplate } from '../models/FormatTemplate.js';
import { dbConnected } from '../utils/helpers.js';

export const getFormats = async (req, res) => {
  try {
    if (!dbConnected()) return res.json([]);
    const formats = await FormatTemplate.find({ userId: req.user.userId });
    res.json(formats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const upsertFormat = async (req, res) => {
  try {
    const { track, course = '', type, format } = req.body;
    if (!track || !type || !format) return res.status(400).json({ error: 'Missing track, type, or format' });
    if (!dbConnected()) return res.status(202).json({ track, type, format, note: 'offline' });
    const doc = await FormatTemplate.findOneAndUpdate(
      { userId: req.user.userId, track, type },
      { track, course, type, format, userId: req.user.userId, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
