import mongoose from 'mongoose';
import { Course } from '../models/Course.js';

export const createCourse = async (req, res) => {
  try {
    const { track, name } = req.body;
    if (!track || !name) return res.status(400).json({ error: 'Missing track or name' });
    if (mongoose.connection.readyState !== 1) {
      return res.status(202).json({ track, name, userId: req.user.userId, _id: 'local-' + Date.now(), note: 'offline' });
    }
    const c = new Course({ track, name, userId: req.user.userId });
    await c.save();
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourses = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.json([]);
    const list = await Course.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
