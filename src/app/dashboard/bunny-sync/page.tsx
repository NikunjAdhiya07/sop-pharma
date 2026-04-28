import { Suspense } from 'react';
import BunnySyncClient from './bunny-sync-client';

export const metadata = { title: 'Bunny Storage Sync' };

export default function BunnySyncPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      }
    >
      <BunnySyncClient />
    </Suspense>
  );
}
