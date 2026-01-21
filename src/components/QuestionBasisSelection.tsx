'use client';

import { 
  Sparkles, 
  UserCircle2, 
  ChevronRight, 
  Info,
  BrainCircuit,
  FileEdit
} from 'lucide-react';

interface SelectionProps {
  onSelect: (type: 'ai' | 'manual') => void;
  title: string;
}

export default function QuestionBasisSelection({ onSelect, title }: SelectionProps) {
  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-white mb-4">{title}</h2>
        <p className="text-gray-400 text-lg">Choose how you want to generate the test questions for this session.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* AI Type */}
        <div 
          onClick={() => onSelect('ai')}
          className="bg-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.08] transition-all duration-300 group cursor-pointer relative overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Sparkles className="h-24 w-24 text-white" />
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-5 rounded-2xl mb-6 shadow-lg group-hover:scale-110 transition-transform">
            <BrainCircuit className="h-10 w-10 text-white" />
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-4">AI Based Questions</h3>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Automatically generate exhaustive question sets from SOP content using Gemini 3 Pro AI.
          </p>
          
          <ul className="text-left space-y-3 mb-8 w-full text-sm text-gray-300">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
              Dynamic & Exhaustive
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
              Variable difficulty levels
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
              Concise explanations included
            </li>
          </ul>
          
          <div className="mt-auto flex items-center text-purple-400 font-bold group-hover:gap-2 transition-all">
            Select AI Mode <ChevronRight className="h-5 w-5 ml-1" />
          </div>
        </div>

        {/* Manual Type */}
        <div 
          onClick={() => onSelect('manual')}
          className="bg-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.08] transition-all duration-300 group cursor-pointer relative overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <UserCircle2 className="h-24 w-24 text-white" />
          </div>
          
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-5 rounded-2xl mb-6 shadow-lg group-hover:scale-110 transition-transform">
            <FileEdit className="h-10 w-10 text-white" />
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-4">Manual Question Set</h3>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Select from pre-defined, standardized question banks curated by Subject Matter Experts.
          </p>
          
          <ul className="text-left space-y-3 mb-8 w-full text-sm text-gray-300">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              Fixed, validated questions
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              SME approved content
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              Strict compliance tracking
            </li>
          </ul>
          
          <div className="mt-auto flex items-center text-emerald-400 font-bold group-hover:gap-2 transition-all">
            Select Manual Mode <ChevronRight className="h-5 w-5 ml-1" />
          </div>
        </div>
      </div>

      <div className="mt-12 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-start gap-4 mx-auto max-w-2xl text-left">
        <Info className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-blue-300 text-sm leading-relaxed">
          <span className="font-bold">Pro Tip:</span> AI Based questions are great for thorough knowledge testing, while Manual sets are ideal for formal compliance audits.
        </p>
      </div>
    </div>
  );
}
