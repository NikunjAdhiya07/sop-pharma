'use client';

import { useState, useEffect } from 'react';
import { 
  Star, 
  Edit3, 
  Check, 
  X, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  FileText,
  ArrowLeft,
  Recycle,
  FolderOpen,
  RotateCcw,
  History,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OptionVariant {
  text: string;
  isCorrect: boolean;
}

interface QuestionData {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: OptionVariant[];
}

interface Review {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  originalQuestion: QuestionData;
  editedQuestion?: QuestionData;
  reviewStatus: 'pending' | 'done';
  flaggedBy?: string;
  flaggedAt: string;
  reviewNotes?: string;
  editedBy?: string;
  editedAt?: string;
  markedDoneBy?: string;
  markedDoneAt?: string;
  versionNumber?: number;
  hasBeenRecycled?: boolean;
}

interface RecycledQuestion {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  oldVersion: QuestionData;
  newVersion: QuestionData;
  replacedBy: string;
  replacedAt: string;
  recycleReason: string;
  folderPath: string;
  isRestored: boolean;
}

export default function MCQReviewPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'review' | 'recycle'>('review');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [recycled, setRecycled] = useState<RecycledQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [editingReview, setEditingReview] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<QuestionData | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeTab === 'review') {
      fetchReviews();
    } else {
      fetchRecycled();
    }
  }, [filter, activeTab]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/mcq-review' 
        : `/api/mcq-review?status=${filter}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setReviews(data.reviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecycled = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/mcq-recycle');
      const data = await response.json();
      
      if (data.success) {
        setRecycled(data.recycled);
      }
    } catch (error) {
      console.error('Error fetching recycled questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (review: Review) => {
    setEditingReview(review._id);
    setEditedData(review.editedQuestion || review.originalQuestion);
  };

  const handleCancelEdit = () => {
    setEditingReview(null);
    setEditedData(null);
  };

  const handleSaveEdit = async (reviewId: string) => {
    if (!editedData) return;

    setSaving(true);
    try {
      const response = await fetch('/api/mcq-review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          editedQuestion: editedData,
          editedBy: 'Admin User', // Replace with actual user
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setEditingReview(null);
        setEditedData(null);
        fetchReviews();
      }
    } catch (error) {
      console.error('Error saving edit:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDone = async (reviewId: string, hasEdits: boolean) => {
    try {
      const response = await fetch('/api/mcq-review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          reviewStatus: 'done',
          markedDoneBy: 'Admin User', // Replace with actual user
          moveToRecycle: hasEdits, // Only recycle if there are edits
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        fetchReviews();
        if (hasEdits) {
          // Show success message about recycling
          alert('Question updated! Old version moved to Recycle Section.');
        }
      }
    } catch (error) {
      console.error('Error marking as done:', error);
    }
  };

  const handleReopen = async (reviewId: string) => {
    try {
      const response = await fetch('/api/mcq-review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          reviewStatus: 'pending',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        fetchReviews();
      }
    } catch (error) {
      console.error('Error reopening review:', error);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
      const response = await fetch(`/api/mcq-review?reviewId=${reviewId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        fetchReviews();
      }
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  const handleRestoreRecycled = async (recycleId: string) => {
    if (!confirm('Restore this old version? This will mark it as restored for reference.')) return;

    try {
      const response = await fetch('/api/mcq-recycle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recycleId,
          restoredBy: 'Admin User',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        fetchRecycled();
        alert('Old version marked as restored!');
      }
    } catch (error) {
      console.error('Error restoring recycled question:', error);
    }
  };

  const handleDeleteRecycled = async (recycleId: string) => {
    if (!confirm('Permanently delete this recycled question? This cannot be undone.')) return;

    try {
      const response = await fetch(`/api/mcq-recycle?recycleId=${recycleId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        fetchRecycled();
      }
    } catch (error) {
      console.error('Error deleting recycled question:', error);
    }
  };

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const updateEditedField = (field: keyof QuestionData, value: any) => {
    if (!editedData) return;
    setEditedData({ ...editedData, [field]: value });
  };

  const updateOption = (index: number, value: string) => {
    if (!editedData) return;
    const newOptions = [...editedData.options];
    newOptions[index] = value;
    
    const newVariants = newOptions.map(opt => ({
      text: opt,
      isCorrect: opt === editedData.correctAnswer
    }));
    
    setEditedData({ 
      ...editedData, 
      options: newOptions,
      optionVariants: newVariants
    });
  };

  const pendingCount = reviews.filter(r => r.reviewStatus === 'pending').length;
  const doneCount = reviews.filter(r => r.reviewStatus === 'done').length;
  const recycledCount = recycled.length;

  // Group recycled by folder
  const recycledByFolder: Record<string, RecycledQuestion[]> = {};
  recycled.forEach(item => {
    if (!recycledByFolder[item.folderPath]) {
      recycledByFolder[item.folderPath] = [];
    }
    recycledByFolder[item.folderPath].push(item);
  });

  return (
    <div className="min-h-screen bg-[#080710] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-all group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Star className="h-10 w-10 text-amber-400 fill-amber-400" />
                MCQ Review Center
              </h1>
              <p className="text-gray-400">Review, edit, and manage question versions</p>
            </div>
            
            <div className="flex gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-amber-400" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Pending</p>
                    <p className="text-2xl font-bold text-white">{pendingCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Done</p>
                    <p className="text-2xl font-bold text-white">{doneCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-3">
                  <Recycle className="h-6 w-6 text-purple-400" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Recycled</p>
                    <p className="text-2xl font-bold text-white">{recycledCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('review')}
            className={`px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'review'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            <Star className="h-5 w-5" />
            Review Section
          </button>
          <button
            onClick={() => setActiveTab('recycle')}
            className={`px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'recycle'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            <Recycle className="h-5 w-5" />
            Recycle Section ({recycledCount})
          </button>
        </div>

        {/* Review Section */}
        {activeTab === 'review' && (
          <>
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-8">
              <button
                onClick={() => setFilter('all')}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${
                  filter === 'all'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                All ({reviews.length})
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${
                  filter === 'pending'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setFilter('done')}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${
                  filter === 'done'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Done ({doneCount})
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
                <p className="text-gray-400 mt-4">Loading reviews...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && reviews.length === 0 && (
              <div className="bg-white/5 rounded-3xl p-20 border border-white/10 text-center">
                <Star className="h-20 w-20 text-gray-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">No Reviews Found</h3>
                <p className="text-gray-400">
                  {filter === 'all' 
                    ? 'No questions have been flagged for review yet.'
                    : `No ${filter} reviews found.`}
                </p>
              </div>
            )}

            {/* Reviews List */}
            <div className="space-y-6">
              {reviews.map((review) => {
                const isEditing = editingReview === review._id;
                const displayQuestion = isEditing ? editedData : (review.editedQuestion || review.originalQuestion);
                const hasEdits = !!review.editedQuestion;
                
                if (!displayQuestion) return null;

                return (
                  <div
                    key={review._id}
                    className={`bg-slate-800/60 rounded-3xl p-8 border transition-all ${
                      review.reviewStatus === 'done'
                        ? 'border-emerald-500/20'
                        : 'border-amber-500/20'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                            review.reviewStatus === 'done'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {review.reviewStatus}
                          </span>
                          <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold">
                            {review.sopIdentifier}
                          </span>
                          <span className="px-3 py-1 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-xs">
                            {review.sopName}
                          </span>
                          {hasEdits && (
                            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                              <Edit3 className="h-3 w-3" />
                              Edited
                            </span>
                          )}
                          {review.versionNumber && review.versionNumber > 1 && (
                            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                              <History className="h-3 w-3" />
                              v{review.versionNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          Flagged {new Date(review.flaggedAt).toLocaleDateString()} by {review.flaggedBy || 'Unknown'}
                        </p>
                        {review.reviewNotes && (
                          <p className="text-sm text-gray-400 mt-2 italic">"{review.reviewNotes}"</p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {!isEditing && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(review)}
                            className="p-2 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition-all border border-blue-500/30"
                            title="Edit Question"
                          >
                            <Edit3 className="h-5 w-5" />
                          </button>
                          
                          {review.reviewStatus === 'pending' ? (
                            <button
                              onClick={() => handleMarkDone(review._id, hasEdits)}
                              className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-all border border-emerald-500/30"
                              title="Mark as Completed"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReopen(review._id)}
                              className="p-2 bg-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/30 transition-all border border-amber-500/30"
                              title="Reopen"
                            >
                              <Clock className="h-5 w-5" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleDelete(review._id)}
                            className="p-2 bg-rose-500/20 text-rose-400 rounded-xl hover:bg-rose-500/30 transition-all border border-rose-500/30"
                            title="Delete"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Show Updated Version Highlight */}
                    {hasEdits && review.reviewStatus === 'done' && !isEditing && (
                      <div className="mb-6 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                          <Sparkles className="h-5 w-5" />
                          Updated Version (Active)
                        </div>
                        <p className="text-sm text-gray-400">
                          This question has been updated and the old version has been moved to the Recycle Section.
                        </p>
                      </div>
                    )}

                    {/* Question Content */}
                    <div className="space-y-4">
                      {/* Question Text */}
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Question</label>
                        {isEditing ? (
                          <textarea
                            value={displayQuestion.question}
                            onChange={(e) => updateEditedField('question', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white resize-none"
                            rows={3}
                          />
                        ) : (
                          <p className="text-xl font-bold text-white">{displayQuestion.question}</p>
                        )}
                      </div>

                      {/* Options */}
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Options</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {displayQuestion.options.map((option, idx) => (
                            <div key={idx} className="relative">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(idx, e.target.value)}
                                  className={`w-full bg-white/5 border rounded-xl p-3 text-white ${
                                    option === displayQuestion.correctAnswer
                                      ? 'border-emerald-500'
                                      : 'border-white/10'
                                  }`}
                                />
                              ) : (
                                <div
                                  className={`p-3 rounded-xl border ${
                                    option === displayQuestion.correctAnswer
                                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                                      : 'bg-white/5 border-white/10 text-gray-300'
                                  }`}
                                >
                                  {option}
                                  {option === displayQuestion.correctAnswer && (
                                    <CheckCircle2 className="inline-block ml-2 h-4 w-4" />
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Correct Answer */}
                      {isEditing && (
                        <div>
                          <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Correct Answer</label>
                          <select
                            value={displayQuestion.correctAnswer}
                            onChange={(e) => {
                              updateEditedField('correctAnswer', e.target.value);
                              const newVariants = displayQuestion.options.map(opt => ({
                                text: opt,
                                isCorrect: opt === e.target.value
                              }));
                              updateEditedField('optionVariants', newVariants);
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white"
                          >
                            {displayQuestion.options.map((opt, idx) => (
                              <option key={idx} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Explanation */}
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Explanation</label>
                        {isEditing ? (
                          <textarea
                            value={displayQuestion.explanation}
                            onChange={(e) => updateEditedField('explanation', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white resize-none"
                            rows={2}
                          />
                        ) : (
                          <p className="text-gray-300">{displayQuestion.explanation}</p>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="flex gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Difficulty: </span>
                          {isEditing ? (
                            <select
                              value={displayQuestion.difficulty}
                              onChange={(e) => {
                                const difficulty = e.target.value as 'Easy' | 'Medium' | 'Hard';
                                const stars = difficulty === 'Easy' ? '⭐' : difficulty === 'Medium' ? '⭐⭐' : '⭐⭐⭐';
                                updateEditedField('difficulty', difficulty);
                                updateEditedField('difficultyStars', stars);
                              }}
                              className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white"
                            >
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          ) : (
                            <span className="text-white font-bold">{displayQuestion.difficulty}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-400">Reference: </span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={displayQuestion.sopReference}
                              onChange={(e) => updateEditedField('sopReference', e.target.value)}
                              className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white"
                            />
                          ) : (
                            <span className="text-white">{displayQuestion.sopReference}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Edit Actions */}
                    {isEditing && (
                      <div className="flex gap-3 mt-6 pt-6 border-t border-white/10">
                        <button
                          onClick={() => handleSaveEdit(review._id)}
                          disabled={saving}
                          className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Check className="h-5 w-5" />
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="flex-1 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <X className="h-5 w-5" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recycle Section */}
        {activeTab === 'recycle' && (
          <>
            {/* Loading State */}
            {loading && (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
                <p className="text-gray-400 mt-4">Loading recycled questions...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && recycled.length === 0 && (
              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-20 border border-white/10 text-center">
                <Recycle className="h-20 w-20 text-gray-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">No Recycled Questions</h3>
                <p className="text-gray-400">
                  Old versions of updated questions will appear here.
                </p>
              </div>
            )}

            {/* Recycled Questions - Folder View */}
            {!loading && recycled.length > 0 && (
              <div className="space-y-4">
                {Object.entries(recycledByFolder).map(([folderPath, items]) => (
                  <div key={folderPath} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
                    {/* Folder Header */}
                    <button
                      onClick={() => toggleFolder(folderPath)}
                      className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-6 w-6 text-purple-400" />
                        <div className="text-left">
                          <p className="text-white font-bold">{folderPath}</p>
                          <p className="text-xs text-gray-400">{items.length} recycled question{items.length > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className={`transform transition-transform ${expandedFolders.has(folderPath) ? 'rotate-180' : ''}`}>
                        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Folder Contents */}
                    {expandedFolders.has(folderPath) && (
                      <div className="border-t border-white/10 p-4 space-y-4">
                        {items.map((item) => (
                          <div key={item._id} className="bg-white/5 rounded-xl p-6 border border-rose-500/20">
                            {/* Recycled Item Header */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="px-3 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold">
                                    OLD VERSION
                                  </span>
                                  <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold">
                                    {item.sopIdentifier}
                                  </span>
                                  {item.isRestored && (
                                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                                      <RotateCcw className="h-3 w-3" />
                                      Restored
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Replaced {new Date(item.replacedAt).toLocaleDateString()} by {item.replacedBy}
                                </p>
                                <p className="text-sm text-gray-400 mt-1 italic">{item.recycleReason}</p>
                              </div>

                              <div className="flex gap-2">
                                {!item.isRestored && (
                                  <button
                                    onClick={() => handleRestoreRecycled(item._id)}
                                    className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-all border border-emerald-500/30"
                                    title="Mark as Restored"
                                  >
                                    <RotateCcw className="h-5 w-5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteRecycled(item._id)}
                                  className="p-2 bg-rose-500/20 text-rose-400 rounded-xl hover:bg-rose-500/30 transition-all border border-rose-500/30"
                                  title="Permanently Delete"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>

                            {/* Old Version */}
                            <div className="mb-4 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                              <p className="text-xs text-rose-400 font-bold uppercase mb-2">Old Version (Deleted)</p>
                              <p className="text-white font-bold mb-2">{item.oldVersion.question}</p>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                {item.oldVersion.options.map((opt, idx) => (
                                  <div
                                    key={idx}
                                    className={`p-2 rounded text-sm ${
                                      opt === item.oldVersion.correctAnswer
                                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                                        : 'bg-white/5 border border-white/10 text-gray-400'
                                    }`}
                                  >
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              <p className="text-sm text-gray-400">{item.oldVersion.explanation}</p>
                            </div>

                            {/* New Version */}
                            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                              <p className="text-xs text-emerald-400 font-bold uppercase mb-2">New Version (Active)</p>
                              <p className="text-white font-bold mb-2">{item.newVersion.question}</p>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                {item.newVersion.options.map((opt, idx) => (
                                  <div
                                    key={idx}
                                    className={`p-2 rounded text-sm ${
                                      opt === item.newVersion.correctAnswer
                                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                                        : 'bg-white/5 border border-white/10 text-gray-400'
                                    }`}
                                  >
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              <p className="text-sm text-gray-400">{item.newVersion.explanation}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
