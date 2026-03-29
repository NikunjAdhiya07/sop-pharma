'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    
    // Defer the redirect to ensure Next.js router is fully initialized
    setTimeout(() => {
      if (userData) {
        // User is logged in, redirect to dashboard
        router.push('/dashboard');
      } else {
        // User is not logged in, redirect to login
        router.push('/login');
      }
    }, 0);
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Sparkles className="h-16 w-16 text-purple-400 animate-pulse mx-auto mb-4" />
        <p className="text-white text-xl">Redirecting...</p>
      </div>
    </div>
  );
}
