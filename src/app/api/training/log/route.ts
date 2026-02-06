import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TrainingLog from '@/models/TrainingLog';
import User from '@/models/User';
import VideoResource from '@/models/VideoResource';
import SOP from '@/models/SOP';
import { getServerSession } from 'next-auth';
// import { authOptions } from '../../auth/[...nextauth]/route'; // Uncomment if available

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
         return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const { resourceType, resourceId, durationSeconds, action, progressPercent } = await request.json();

    if (!resourceType || !resourceId) {
        return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }

    // Identify Resource Title
    let resourceTitle = 'Unknown';
    if (resourceType === 'video') {
        const video = await VideoResource.findById(resourceId);
        resourceTitle = video ? video.title : 'Unknown Video';
    } else if (resourceType === 'sop') {
        const sop = await SOP.findById(resourceId);
        resourceTitle = sop ? sop.title : 'Unknown SOP';
    }

    // Create Log Entry
    await TrainingLog.create({
        userId: user._id,
        resourceType,
        resourceId,
        resourceTitle,
        action: action || 'viewed',
        durationSeconds: durationSeconds || 0,
        progressPercent,
        metadata: {
            userAgent: request.headers.get('user-agent'),
        }
    });

    // Update User Progress
    if (action === 'completed' || (progressPercent && progressPercent >= 95)) {
        if (resourceType === 'video') {
             await User.findByIdAndUpdate(user._id, {
                 $addToSet: { 'inductionProgress.videosWatched': resourceId }
             });
        } else if (resourceType === 'sop') {
             await User.findByIdAndUpdate(user._id, {
                 $addToSet: { 'inductionProgress.sopsRead': resourceId }
             });
        }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Training log error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
