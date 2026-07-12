import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username:     { type: String, unique: true },
  passwordHash: String,
  displayName:  String,
  employeeId:   { type: String, default: null },
  email:        { type: String, default: null },
  tvaRole:      { type: String, default: 'employee' },
  teamLead:     { type: String, default: null },
  tvaProfile:   { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt:    { type: Date, default: Date.now }
});

export const User = mongoose.model('User', UserSchema);
