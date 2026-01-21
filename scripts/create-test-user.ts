import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

// User Schema
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function createTestUser() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env.local');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ username: 'demo' });
    
    if (existingUser) {
      console.log('⚠️  User "demo" already exists');
      console.log('📋 User details:');
      console.log(`   Username: ${existingUser.username}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Created: ${existingUser.createdAt}`);
    } else {
      // Create test user
      const testUser = new User({
        username: 'demo',
        password: '123456', // In production, hash this password
        name: 'Demo User',
        role: 'admin',
      });

      await testUser.save();
      console.log('✅ Test user created successfully!');
      console.log('📋 Login credentials:');
      console.log('   Username: demo');
      console.log('   Password: 123456');
      console.log(`   Role: ${testUser.role}`);
    }

    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createTestUser();
