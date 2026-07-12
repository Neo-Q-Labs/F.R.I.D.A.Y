import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
  userId:    mongoose.Schema.Types.ObjectId,
  track:     String,
  name:      String,
  createdAt: { type: Date, default: Date.now }
});

export const Course = mongoose.model('Course', CourseSchema);
