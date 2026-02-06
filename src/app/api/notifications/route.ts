import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Notification } from '@/models/Notification';
import connectDB from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    await connectDB();

    const query: any = { recipient: userId };
    if (unreadOnly) {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // Limit to recent 50

    const unreadCount = await Notification.countDocuments({ recipient: userId, read: false });

    return NextResponse.json({ 
      success: true, 
      notifications,
      unreadCount
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { notificationId, markAllRead, userId } = body;

    await connectDB();

    if (markAllRead && userId) {
      await Notification.updateMany(
        { recipient: userId, read: false },
        { $set: { read: true } }
      );
      return NextResponse.json({ success: true, message: 'All marked as read' });
    }

    if (notificationId) {
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { $set: { read: true } },
        { new: true }
      );
      
      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, notification });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
