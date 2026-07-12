import mongoose from 'mongoose';

const UserApiKeySchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  provider:     { type: String, enum: ['groq', 'openai', 'anthropic', 'gemini', 'mistral', 'deepseek', 'nvidia'], required: true },
  encryptedKey: { type: String, required: true },
  iv:           { type: String, required: true },
  authTag:      { type: String, required: true },
  model:        { type: String, default: '' },
  updatedAt:    { type: Date, default: Date.now }
});
UserApiKeySchema.index({ userId: 1, provider: 1 }, { unique: true });

export const UserApiKey = mongoose.model('UserApiKey', UserApiKeySchema);
