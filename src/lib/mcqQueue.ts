/**
 * MCQ Generation Queue System
 * Handles concurrent MCQ generation with configurable parallelism
 */

import { EventEmitter } from 'events';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { generateMCQsFromSOP } from './gemini';

interface QueueTask {
  sopId: string;
  targetCount?: number;
  mcqBankId?: string;
  priority?: number; // Higher priority = processed first
  language?: 'English' | 'Gujarati';
}

interface QueueProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  current: string[];
  errors: Array<{ fileName: string; error: string }>;
}

class MCQGenerationQueue {
  private queue: QueueTask[] = [];
  private processing = new Set<string>(); // Track SOPs currently being processed
  private events = new EventEmitter();
  private maxConcurrent = 5; // Process 5 SOPs simultaneously
  private stats = {
    total: 0,
    completed: 0,
    failed: 0,
    errors: [] as Array<{ fileName: string; error: string }>,
  };

  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a task to the queue
   */
  addTask(task: QueueTask) {
    // Check if already in queue or processing
    const isDuplicate = 
      this.queue.some(t => t.sopId === task.sopId) ||
      this.processing.has(task.sopId);

    if (isDuplicate) {
      console.log(`⚠️ Task for SOP ${task.sopId} already in queue or processing`);
      return false;
    }

    this.queue.push(task);
    this.stats.total++;
    
    // Sort by priority (higher first)
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    console.log(`📋 Added task to queue. Queue size: ${this.queue.length}`);
    return true;
  }

  /**
   * Add multiple tasks at once
   */
  addBulkTasks(tasks: QueueTask[]) {
    let added = 0;
    for (const task of tasks) {
      if (this.addTask(task)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Set progress callback for real-time updates
   */
  onProgress(callback: (progress: QueueProgress) => void) {
    this.events.on('progress', callback);
  }

  /**
   * Get current progress
   */
  getProgress(): QueueProgress {
    return {
      total: this.stats.total,
      completed: this.stats.completed,
      failed: this.stats.failed,
      inProgress: this.processing.size,
      current: Array.from(this.processing),
      errors: this.stats.errors,
    };
  }

  /**
   * Process a single SOP
   */
  private async processSOP(task: QueueTask): Promise<void> {
    const { sopId, targetCount, mcqBankId } = task;

    try {
      // Find SOP
      const sop = await SOP.findById(sopId);
      if (!sop) {
        throw new Error('SOP not found');
      }

      this.processing.add(sopId);
      this.emitProgress();

      console.log(`🚀 Starting MCQ generation for: ${sop.name}`);

      // Guard: SOP must have readable content
      if (!sop.content || sop.content.trim().length < 100) {
        console.error(`❌ SOP ${sop.name} has insufficient content (${sop.content?.length || 0} chars). Marking as failed.`);
        sop.status = 'failed';
        await sop.save();
        this.stats.failed++;
        this.stats.errors.push({ fileName: sopId, error: 'SOP content is empty or too short to generate questions' });
        this.processing.delete(sopId);
        this.events.emit('completed', sopId);
        this.events.emit(`completed:${sopId}`);
        this.emitProgress();
        return;
      }

      const effectiveLanguage = task.language || sop.language || 'English';

      // Check for existing bank matching the same language
      let existingBank = mcqBankId 
        ? await MCQBank.findById(mcqBankId)
        : await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
      
      let existingQuestions: string[] = [];
      if (existingBank) {
        existingQuestions = existingBank.mcqs.map(m => m.question);
        console.log(`🔄 Generating MORE ${effectiveLanguage} questions for ${sop.name}. Current count: ${existingQuestions.length}`);
      }

      // Update SOP status
      sop.status = 'processing';
      await sop.save();

      // Generate MCQs with incremental saving
      const result = await generateMCQsFromSOP({
        sopContent: sop.content,
        sopName: sop.name,
        sopIdentifier: sop.identifier || sop.name,
        existingQuestions: existingQuestions,
        targetCount: targetCount || 100,
        isBulk: false,
        language: effectiveLanguage,
        onBatchComplete: async (batchMcqs: any[]) => {
          if (batchMcqs.length > 0) {
            // Get the freshest bank state (match by language)
            const currentBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
            
            if (!currentBank) {
              // Create new bank
              await MCQBank.create({
                sopId: sop._id,
                sopName: sop.name,
                sopIdentifier: sop.identifier,
                department: sop.department,
                mcqs: batchMcqs,
                totalQuestions: batchMcqs.length,
                difficultyDistribution: {
                  easy: batchMcqs.filter(m => m.difficulty === 'Easy').length,
                  medium: batchMcqs.filter(m => m.difficulty === 'Medium').length,
                  hard: batchMcqs.filter(m => m.difficulty === 'Hard').length,
                },
                aiModel: 'gemini-3-pro-preview',
                language: effectiveLanguage,
              });
              console.log(`💾 Created NEW bank with first batch of ${batchMcqs.length} questions for ${sop.name}`);
            } else {
              // Filter duplicates
              const currentQuestions = new Set(currentBank.mcqs.map(m => m.question.replace(/^⭐\s*/, '').trim()));
              const uniqueNewMcqs = batchMcqs.filter(m => {
                const questionText = m.question.replace(/^⭐\s*/, '').trim();
                return !currentQuestions.has(questionText);
              });

              if (uniqueNewMcqs.length > 0) {
                currentBank.mcqs = [...currentBank.mcqs, ...uniqueNewMcqs];
                currentBank.totalQuestions = currentBank.mcqs.length;
                
                currentBank.difficultyDistribution = {
                  easy: currentBank.mcqs.filter(m => m.difficulty === 'Easy').length,
                  medium: currentBank.mcqs.filter(m => m.difficulty === 'Medium').length,
                  hard: currentBank.mcqs.filter(m => m.difficulty === 'Hard').length,
                };
                
                await currentBank.save();
                console.log(`💾 Appended ${uniqueNewMcqs.length} unique questions to ${sop.name}. Total: ${currentBank.mcqs.length}`);
              }
            }
          }
        }
      });

      // Fetch final state (match by language)
      const finalBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });

      // Update SOP status
      if ((!finalBank || finalBank.mcqs.length === 0) && result.mcqs.length === 0) {
        sop.status = 'failed';
        await sop.save();
        throw new Error('AI failed to generate any questions');
      }

      sop.status = 'completed';
      sop.processedAt = new Date();
      sop.mcqCount = finalBank ? finalBank.mcqs.length : 0;
      await sop.save();

      console.log(`✅ Completed MCQ generation for ${sop.name}. Total: ${sop.mcqCount} questions`);
      
      this.stats.completed++;

    } catch (error) {
      console.error(`❌ Error processing SOP ${sopId}:`, error);
      
      // Try to update SOP status
      try {
        const sop = await SOP.findById(sopId);
        if (sop) {
          const currentBank = await MCQBank.findOne({ sopId: sop._id });
          if (!currentBank || currentBank.mcqs.length === 0) {
            sop.status = 'failed';
          } else {
            sop.status = 'completed';
          }
          await sop.save();
        }
      } catch (updateError) {
        console.error('Failed to update SOP status:', updateError);
      }

      this.stats.failed++;
      this.stats.errors.push({
        fileName: sopId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

    } finally {
      this.processing.delete(sopId);
      this.events.emit('completed', sopId);
      this.events.emit(`completed:${sopId}`);
      this.emitProgress();
    }
  }

  /**
   * Wait for a specific SOP task to complete
   */
  async waitForTask(sopId: string): Promise<void> {
    if (!this.processing.has(sopId) && !this.queue.some(t => t.sopId === sopId)) {
      return;
    }

    return new Promise((resolve) => {
      this.events.once(`completed:${sopId}`, resolve);
    });
  }

  /**
   * Check if an SOP is being processed
   */
  isProcessing(sopId: string): boolean {
    return this.processing.has(sopId) || this.queue.some(t => t.sopId === sopId);
  }

  /**
   * Emit progress update
   */
  private emitProgress() {
    this.events.emit('progress', this.getProgress());
  }

  /**
   * Start processing the queue
   */
  async start(): Promise<void> {
    console.log(`🎬 Starting queue processor with max ${this.maxConcurrent} concurrent tasks`);

    while (this.queue.length > 0 || this.processing.size > 0) {
      // Start new tasks if we have capacity
      while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          // Don't await - let it run in parallel
          this.processSOP(task).catch(err => {
            console.error('Unhandled error in processSOP:', err);
          });
        }
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`🏁 Queue processing complete. Completed: ${this.stats.completed}, Failed: ${this.stats.failed}`);
  }

  /**
   * Clear the queue and reset stats
   */
  reset() {
    this.queue = [];
    this.processing.clear();
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      errors: [],
    };
  }
}

// Export a singleton instance
export const mcqQueue = new MCQGenerationQueue(5);

export default MCQGenerationQueue;
