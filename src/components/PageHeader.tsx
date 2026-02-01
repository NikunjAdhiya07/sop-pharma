'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';

interface PageHeaderProps {
  showBack?: boolean;
  showHome?: boolean;
  backUrl?: string;
  className?: string;
}

export default function PageHeader({ 
  showBack = true, 
  showHome = true, 
  backUrl,
  className = '' 
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backUrl) {
      router.push(backUrl);
    } else {
      router.back();
    }
  };

  const handleHome = () => {
    router.push('/dashboard');
  };

  if (!showBack && !showHome) return null;

  return (
    <div className={`flex items-center gap-3 mb-6 ${className}`}>
      {showBack && (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/20 hover:border-white/30"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="font-semibold">Back</span>
        </button>
      )}
      
      {showHome && (
        <button
          onClick={handleHome}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all shadow-lg"
        >
          <Home className="h-4 w-4" />
          <span className="font-semibold">Home</span>
        </button>
      )}
    </div>
  );
}
