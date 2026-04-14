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
      serverSelectionTimeoutMS: 10000, // 10s — fail fast, retry handles the rest
      socketTimeoutMS: 60000,          // 1 min for slow queries
      connectTimeoutMS: 10000,         // 10s TCP connect
      maxPoolSize: 10,                 // Reuse connections across serverless invocations
      minPoolSize: 1,
      heartbeatFrequencyMS: 10000,     // Keep Atlas connection alive on Vercel
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
          } else if (error.message?.includes('querySrv')) {
            console.error(
              '🔌 SRV DNS lookup failed (common with mongodb+srv://). Try: use a reliable DNS (e.g. 8.8.8.8), turn off VPN/proxy or "secure DNS" that blocks SRV, or in Atlas use the standard connection string (mongodb://host:27017,...) instead of mongodb+srv://.'
            );
          } else if (error.message?.includes('ETIMEDOUT')) {
            console.error('⏱️ Connection timed out. Check firewall settings or MongoDB Atlas IP whitelist.');
          } else if (error.message?.includes('authentication failed')) {
            console.error('🔐 Authentication failed. Check your MongoDB credentials.');
          }
          
          // Don't retry on authentication errors
          if (error.message?.includes('authentication failed')) {
            throw error;
          }
          
          // Wait before retrying (short fixed delay — serverless has tight time budgets)
          if (attempt < maxRetries) {
            const waitTime = 1000; // 1 second between retries
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
