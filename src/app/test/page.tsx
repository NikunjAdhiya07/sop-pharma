'use client';

import { useRouter } from 'next/navigation';
import { 
  UserSquare2, 
  GraduationCap, 
  RefreshCw, 
  Settings2, 
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ClipboardCheck,
  Star,
  Zap
} from 'lucide-react';

const testTypes = [
  {
    id: 'interview',
    title: 'Interview Test',
    description: 'Specialized test for candidates to evaluate their SOP knowledge and technical competency.',
    icon: UserSquare2,
    color: 'from-blue-600 to-cyan-600',
    hoverBorder: 'hover:border-blue-500',
    lightColor: 'text-blue-400',
    path: '/test/interview'
  },
  {
    id: 'induction',
    title: 'Induction Training Test',
    description: 'Mandatory training assessment for new employees before they begin operations.',
    icon: GraduationCap,
    color: 'from-purple-600 to-pink-600',
    hoverBorder: 'hover:border-purple-500',
    lightColor: 'text-purple-400',
    path: '/test/induction'
  },
  {
    id: 'regular',
    title: 'Regular Training Test',
    description: 'Ongoing periodic assessment to ensure continued proficiency in standard procedures.',
    icon: RefreshCw,
    color: 'from-emerald-600 to-teal-600',
    hoverBorder: 'hover:border-emerald-500',
    lightColor: 'text-emerald-400',
    path: '/test/regular'
  },
  {
    id: 'change-control',
    title: 'Change Control Training Test',
    description: 'Test focused on understanding changes made to existing SOPs or systems.',
    icon: Settings2,
    color: 'from-orange-600 to-amber-600',
    hoverBorder: 'hover:border-orange-500',
    lightColor: 'text-orange-400',
    path: '/test/change-control'
  },
  {
    id: 'kapa',
    title: 'KAPA/Incident Training Test',
    description: 'Specific assessment regarding Corrective Actions, Preventive Actions, and incident responses.',
    icon: AlertTriangle,
    color: 'from-red-600 to-rose-600',
    hoverBorder: 'hover:border-red-500',
    lightColor: 'text-red-400',
    path: '/test/kapa'
  },
  {
    id: 'specific',
    title: 'Specific Training Test',
    description: 'Test yourself with instant feedback. See correct answers and explanations immediately after each choice.',
    icon: Zap,
    color: 'from-yellow-600 to-orange-600',
    hoverBorder: 'hover:border-yellow-500',
    lightColor: 'text-yellow-400',
    path: '/test/specific'
  }
];

export default function TestHubPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/mcq-review')}
              className="px-4 py-2 bg-amber-600/30 text-amber-300 rounded-lg hover:bg-amber-600/50 transition-all flex items-center gap-2 border border-amber-500/30"
            >
              <Star className="h-4 w-4" /> Review Center
            </button>
            <button
              onClick={() => router.push('/test/practice')}
              className="px-4 py-2 bg-purple-600/30 text-purple-300 rounded-lg hover:bg-purple-600/50 transition-all flex items-center gap-2 border border-purple-500/30"
            >
              <ClipboardCheck className="h-4 w-4" /> Practice Mode
            </button>
          </div>
        </div>

        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-6">Test Center</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Select the appropriate test category to begin your assessment. 
            All tests are generated from validated SOP MCQ banks.
          </p>
        </div>

        {/* Test Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testTypes.map((type) => (
            <div
              key={type.id}
              onClick={() => router.push(type.path)}
              className={`bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl cursor-pointer group flex flex-col h-full ${type.hoverBorder}`}
            >
              <div className={`bg-gradient-to-br ${type.color} p-4 rounded-2xl w-fit mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                <type.icon className="h-8 w-8 text-white" />
              </div>
              
              <h2 className="text-3xl font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400">
                {type.title}
              </h2>
              
              <p className="text-gray-400 mb-8 flex-1 leading-relaxed text-lg">
                {type.description}
              </p>
              
              <div className={`mt-auto flex items-center ${type.lightColor} font-bold text-lg group-hover:gap-2 transition-all`}>
                Enter Section <ChevronRight className="h-5 w-5 ml-1" />
              </div>
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-16 bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="bg-emerald-500/20 p-4 rounded-2xl border border-emerald-500/30">
              <ClipboardCheck className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-1">Standardized Assessments</h3>
              <p className="text-gray-400">All tests follow compliance guidelines and record scores automatically for training logs.</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-sm font-mono">SYSTEM READY</p>
            <div className="flex gap-1 justify-end mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-75"></div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-150"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
