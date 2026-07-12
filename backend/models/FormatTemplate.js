import mongoose from 'mongoose';

const FormatTemplateSchema = new mongoose.Schema({
  userId:    mongoose.Schema.Types.ObjectId,
  track:     { type: String, required: true },
  course:    { type: String, default: '' },
  type:      { type: String, enum: ['coding', 'mcq'], required: true },
  format:    { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export const FormatTemplate = mongoose.model('FormatTemplate', FormatTemplateSchema);
