import mongoose from 'mongoose';
import { Generation } from '../models/Generation.js';

export const saveHistory = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(202).json({
        ...req.body,
        userId: req.user.userId,
        _id: 'local-' + Date.now(),
        note: 'Offline/Local storage active'
      });
    }
    const generation = new Generation({ ...req.body, userId: req.user.userId });
    await generation.save();
    res.json(generation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getHistory = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }
    const history = await Generation.find({ userId: req.user.userId }).sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
