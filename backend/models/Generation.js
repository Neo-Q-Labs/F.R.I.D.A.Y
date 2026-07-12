import mongoose from 'mongoose';

const GenerationSchema = new mongoose.Schema({
  userId:     mongoose.Schema.Types.ObjectId,
  topic:      String,
  type:       String,
  timestamp:  { type: Date, default: Date.now },
  questions:  Array,
  client:     String,
  stack:      String,
  domain:     String,
  track:      String,
  course:     String,
  difficulty: String
});

export const Generation = mongoose.model('Generation', GenerationSchema);
