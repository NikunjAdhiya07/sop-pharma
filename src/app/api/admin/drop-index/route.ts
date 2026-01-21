import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET() {
  return await dropIndexes();
}

export async function POST() {
  return await dropIndexes();
}

async function dropIndexes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const results = [];

    // 1. Drop SOP unique identifier index
    try {
      const sopCollection = db.collection('sops');
      console.log('🗑️ Dropping unique index on sops.identifier...');
      await sopCollection.dropIndex('identifier_1');
      results.push('Dropped unique index on sops.identifier_1');
    } catch (error: any) {
      results.push('sops.identifier_1: ' + (error.message || 'Not found'));
    }

    // 2. Drop MCQBank unique sopId index
    try {
      const mcqCollection = db.collection('mcqbanks');
      console.log('🗑️ Dropping unique index on mcqbanks.sopId...');
      await mcqCollection.dropIndex('sopId_1');
      results.push('Dropped unique index on mcqbanks.sopId_1');
    } catch (error: any) {
      results.push('mcqbanks.sopId_1: ' + (error.message || 'Not found'));
    }

    return NextResponse.json({
      success: true,
      message: 'Index cleanup process completed',
      details: results
    });

  } catch (error) {
    console.error('❌ Error dropping indexes:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
