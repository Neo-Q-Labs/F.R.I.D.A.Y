import mongoose from 'mongoose';

export async function connectToMongoDB() {
  const customUri = process.env.MONGODB_URI;
  let uriToUse = customUri;

  if (!uriToUse) {
    console.warn('MONGODB_URI not configured. Running in offline/demo mode. Some features will be limited.');
    return;
  }

  if (uriToUse.includes('<') || uriToUse.includes('>')) {
    console.warn('MONGODB_URI contains angular brackets or placeholders. Sanitizing...');
    uriToUse = uriToUse
      .replace(/<deepudama1818_db_user\s*>/g, 'deepudama1818_db_user')
      .replace(/<password>/g, 'x6k1E4rSKAa2emer')
      .replace(/<[^>]+>/g, '');
  }

  const maskedUri = uriToUse.replace(/:([^@]+)@/, ':****@');
  console.log(`Connecting to MongoDB of target: ${maskedUri}`);

  try {
    await mongoose.connect(uriToUse, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB Atlas successfully.');
  } catch (err) {
    console.error('MongoDB Atlas connection failure:', err.message);
    console.warn('Application will start successfully without database tracking. Features will degrade gracefully.');
  }
}
