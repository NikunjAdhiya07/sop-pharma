import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

const MONGODB_URI: string = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
    };

    cached.promise = (async () => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Attempting MongoDB connection (${attempt}/${maxRetries})...`);
          
          const connection = await mongoose.connect(MONGODB_URI, opts);
          console.log('✅ MongoDB connected successfully');
          return connection;
          
        } catch (error: any) {
          lastError = error;
          console.error(`❌ MongoDB connection attempt ${attempt} failed:`, error.message);
          
          // Check for specific network errors
          if (error.message?.includes('ENOTFOUND')) {
            console.error('🌐 DNS resolution failed. Check your internet connection or MongoDB Atlas hostname.');
          } else if (error.message?.includes('ETIMEDOUT')) {
            console.error('⏱️ Connection timed out. Check firewall settings or MongoDB Atlas IP whitelist.');
          } else if (error.message?.includes('authentication failed')) {
            console.error('🔐 Authentication failed. Check your MongoDB credentials.');
          }
          
          // Don't retry on authentication errors
          if (error.message?.includes('authentication failed')) {
            throw error;
          }
          
          // Wait before retrying (exponential backoff)
          if (attempt < maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      // All retries failed
      console.error('💥 All MongoDB connection attempts failed');
      throw lastError || new Error('Failed to connect to MongoDB after multiple attempts');
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
