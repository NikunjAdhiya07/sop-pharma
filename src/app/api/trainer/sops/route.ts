import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import User from '@/models/User';
import { getServerSession } from 'next-auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== 'trainer') {
         // Optionally allow admins to see everything, but this is for "My SOPs"
         if (user.role !== 'admin') {
             return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
         }
    }

    // Find SOPs where this user is assigned
    const sops = await SOP.find({ 
        assignedTrainers: user._id 
    }).select('identifier name version department uploadedAt nextReviewDate trainerRetrainingStatus');
    
    // Format response to include simple "retraining needed" flag
    const formattedSops = sops.map(sop => {
        const myStatus = sop.trainerRetrainingStatus?.find((s: any) => s.trainerId.toString() === user._id.toString());
        return {
            ...sop.toObject(),
            needsRetraining: myStatus?.status === 'pending'
        };
    });

    return NextResponse.json({ success: true, sops: formattedSops });

  } catch (error) {
    console.error('Fetch trainer SOPs error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
