import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { sops } = await req.json();

    if (!sops || !Array.isArray(sops)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: sops array required' },
        { status: 400 }
      );
    }
    
    // Note: Critical endpoints should implement server-side session checks.
    // Assuming middleware handles basic auth, but role check might be needed here.
    // For now proceed, as strict session check depends on auth implementation.


    let updatedCount = 0;
    const errors: any[] = [];

    for (const sopData of sops) {
      try {
        const updateFields: any = {};

        // Only update fields that are provided
        if (sopData.effectiveDate !== undefined) {
          updateFields.effectiveDate = sopData.effectiveDate || null;
        }
        if (sopData.reviewDate !== undefined) {
          updateFields.reviewDate = sopData.reviewDate || null;
        }
        if (sopData.expiryDate !== undefined) {
          updateFields.expiryDate = sopData.expiryDate || null;
        }
        const currentSOP = await SOP.findById(sopData._id);
        
        let shouldTriggerRetraining = false;
        if (sopData.version !== undefined && currentSOP) {
            updateFields.version = sopData.version || null;
            if (sopData.version !== currentSOP.version) {
                shouldTriggerRetraining = true;
            }
        }
        if (sopData.owner !== undefined) {
          updateFields.owner = sopData.owner || null;
        }

        if (shouldTriggerRetraining && currentSOP?.assignedTrainers?.length) {
            // value to set: array of objects { trainerId, status: 'pending' }
            // We need to keep existing trainers but reset their status
            const newStatus = currentSOP.assignedTrainers.map((trainerId: any) => ({
                trainerId: trainerId,
                status: 'pending',
                lastTrainedAt: undefined
            }));
            updateFields.trainerRetrainingStatus = newStatus;
        }

        await SOP.updateOne(
          { _id: sopData._id },
          { $set: updateFields }
        );

        updatedCount++;
      } catch (error) {
        errors.push({
          sopId: sopData._id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      totalRequested: sops.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Bulk update failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
