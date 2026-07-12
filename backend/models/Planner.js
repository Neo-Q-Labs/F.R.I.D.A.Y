import mongoose from 'mongoose';

const PlannerWeekSchema = new mongoose.Schema({
  weekNumber:        Number,
  weekLabel:         String,
  topic:             String,
  subtopics:         [String],
  additionalContext: String,
  skillBuilder:      { questions: { type: Array, default: [] } },
  practiceAtHome:    { questions: { type: Array, default: [] } },
  challengeYourself: { questions: { type: Array, default: [] } }
}, { _id: false });

const PlannerSchema = new mongoose.Schema({
  userId:                 mongoose.Schema.Types.ObjectId,
  courseName:             { type: String, required: true },
  track:                  String,
  plannerFile:            String,
  skillBuilderCount:      { type: Number, default: 3 },
  practiceAtHomeCount:    { type: Number, default: 3 },
  challengeYourselfCount: { type: Number, default: 2 },
  weeks:                  [PlannerWeekSchema],
  createdAt:              { type: Date, default: Date.now }
});

export const Planner = mongoose.model('Planner', PlannerSchema);
