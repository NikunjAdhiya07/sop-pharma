import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import MCQBank from '@/models/MCQBank';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const { identifier } = await request.json();

    // Find the SOP
    const sop = await SOP.findOne({ identifier });
    
    if (!sop) {
      return NextResponse.json(
        { error: `SOP with identifier ${identifier} not found` },
        { status: 404 }
      );
    }

    console.log(`Found SOP: ${sop.name}`);
    console.log(`Current language: ${sop.language || 'not set'}`);

    // Update SOP to Gujarati
    sop.language = 'Gujarati';
    await sop.save();
    console.log('✅ Updated SOP language to Gujarati');

    // Update SOPLibrary
    const sopLibrary = await SOPLibrary.findOne({ sopIdentifier: identifier });
    if (sopLibrary) {
      sopLibrary.language = 'Gujarati';
      await sopLibrary.save();
      console.log('✅ Updated SOPLibrary language to Gujarati');
    }

    // Update MasterSOPRepository
    const masterRepo = await MasterSOPRepository.findOne({ sopIdentifier: identifier });
    if (masterRepo) {
      masterRepo.language = 'Gujarati';
      await masterRepo.save();
      console.log('✅ Updated MasterSOPRepository language to Gujarati');
    }

    // Update MCQBank if it exists
    const mcqBank = await MCQBank.findOne({ sopId: sop._id });
    if (mcqBank) {
      mcqBank.language = 'Gujarati';
      await mcqBank.save();
      console.log('✅ Updated MCQBank language to Gujarati');
    }

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${identifier} to Gujarati`,
      sop: {
        id: sop._id,
        name: sop.name,
        identifier: sop.identifier,
        language: sop.language,
      },
    });

  } catch (error) {
    console.error('Error updating SOP:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update SOP',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
