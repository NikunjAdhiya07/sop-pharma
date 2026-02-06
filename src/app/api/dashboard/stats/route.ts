import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import User from '@/models/User';
import { Notification } from '@/models/Notification';

export async function GET() {
  try {
    await connectDB();

    // Get total SOPs
    const totalSOPs = await SOP.countDocuments();

    // Get MCQ Banks stats
    const mcqBanks = await MCQBank.find({}, { totalQuestions: 1, createdAt: 1 }).lean();
    const totalMCQBanks = mcqBanks.length;
    const totalQuestions = mcqBanks.reduce((sum, bank) => sum + (bank.totalQuestions || 0), 0);

    // Get last activity
    const lastSOP = await SOP.findOne().sort({ updatedAt: -1 }).select('updatedAt');
    const lastBank = await MCQBank.findOne().sort({ updatedAt: -1 }).select('updatedAt');

    let lastActivity = null;
    if (lastSOP && lastBank) {
      lastActivity = lastSOP.updatedAt > lastBank.updatedAt ? lastSOP.updatedAt : lastBank.updatedAt;
    } else if (lastSOP) {
      lastActivity = lastSOP.updatedAt;
    } else if (lastBank) {
      lastActivity = lastBank.updatedAt;
    }

    // Check for expiring SOPs and notify admins (Background Check)
    // Run asynchronously to not block stats response
    (async () => {
        try {
            const today = new Date();
            const thirtyDaysFromNow = new Date(today);
            thirtyDaysFromNow.setDate(today.getDate() + 30);

            const expiringSOPs = await SOP.find({
                $or: [
                    { expiryDate: { $gte: today, $lte: thirtyDaysFromNow } },
                    { reviewDate: { $gte: today, $lte: thirtyDaysFromNow } }
                ]
            }).select('name identifier expiryDate reviewDate');

            if (expiringSOPs.length > 0) {
                const admins = await User.find({ role: { $in: ['admin', 'qa-head'] } }).select('_id');
                
                for (const sop of expiringSOPs) {
                    const date = sop.reviewDate || sop.expiryDate;
                    const dateStr = date ? new Date(date).toLocaleDateString() : 'soon';
                    const link = `/sop-library/${sop._id}`;

                    for (const admin of admins) {
                        // Avoid duplicates: Check if we notified about this SOP recently
                         const existingNotif = await Notification.findOne({
                            recipient: admin._id,
                            type: 'expiry',
                            link: link
                         }).sort({ createdAt: -1 });

                         // Only notify if never notified OR last notification was > 7 days ago and was read
                         let shouldNotify = true;
                         if (existingNotif) {
                             const daysSince = (today.getTime() - new Date(existingNotif.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                             if (daysSince < 7) shouldNotify = false;
                             if (!existingNotif.read && daysSince < 14) shouldNotify = false; // Don't spam if they haven't read it
                         }

                         if (shouldNotify) {
                             await Notification.create({
                                 recipient: admin._id,
                                 type: 'expiry',
                                 title: 'SOP Expiring Soon',
                                 message: `SOP "${sop.name}" (${sop.identifier}) is expiring on ${dateStr}. Please review actions.`,
                                 link: link,
                                 read: false
                             });
                         }
                    }
                }
            }
        } catch (e) {
            console.error('Background expiry check failed:', e);
        }
    })();

    return NextResponse.json({
      success: true,
      stats: {
        totalSOPs,
        totalMCQBanks,
        totalQuestions,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
