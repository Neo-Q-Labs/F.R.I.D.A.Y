import mongoose from 'mongoose';

const TokenUsageSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  provider:     { type: String, required: true },
  date:         { type: String, required: true },
  tokensUsed:   { type: Number, default: 0 },
  requestCount: { type: Number, default: 0 },
  updatedAt:    { type: Date, default: Date.now }
});
TokenUsageSchema.index({ userId: 1, provider: 1, date: 1 }, { unique: true });

export const TokenUsage = mongoose.model('TokenUsage', TokenUsageSchema);
