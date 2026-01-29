import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { mcqQueue } from '@/lib/mcqQueue';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get all uploaded SOPs that don't have MCQs yet or need regeneration
    const sops = await SOP.find({ status: { $in: ['uploaded', 'failed'] } });

    if (sops.length === 0) {
      return NextResponse.json(
        { error: 'No files available for MCQ generation' },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Add all SOPs to the global singleton queue
        const tasks = sops.map(sop => ({
          sopId: sop._id.toString(),
          targetCount: 100,
          priority: 1, // Normal priority for bulk
        }));

        mcqQueue.addBulkTasks(tasks);
        console.log(`📋 Added ${tasks.length} SOPs to the global concurrent processing queue`);

        // Set up progress streaming using the singleton's progress
        const sendProgress = () => {
          const progress = mcqQueue.getProgress();
          const streamData = {
            total: progress.total,
            completed: progress.completed,
            failed: progress.failed,
            inProgress: progress.inProgress,
            current: progress.current.join(', '),
            errors: progress.errors,
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`)
          );
        };

        // Listen for progress updates
        mcqQueue.onProgress(() => {
          sendProgress();
        });

        // Start processing if not already running
        const queuePromise = mcqQueue.start();

        // Wait for ALL tasks in the queue to complete (or at least the ones we just added)
        // For simplicity, we'll wait for the queue to finish its current workload
        await queuePromise;

        // Send final update
        sendProgress();
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bulk MCQ generation error:', error);
    return NextResponse.json(
      {
        error: 'Bulk MCQ generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
