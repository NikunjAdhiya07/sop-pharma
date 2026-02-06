'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationBell({ userId }: { userId?: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Internal state for user ID if not passed prop
  const [internalUserId, setInternalUserId] = useState<string | undefined>(userId);

  useEffect(() => {
    if (userId) {
        setInternalUserId(userId);
    } else {
        const storedUser = localStorage.getItem('user'); // Changed from 'currentUser' to 'user' based on other files
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                // Handle both {_id: ...} (mongo) and {id: ...} structures if any
                setInternalUserId(parsed._id || parsed.id);
            } catch (e) {
                console.error("Error parsing user from local storage", e);
            }
        }
    }
  }, [userId]);

  const activeUserId = userId || internalUserId;

  useEffect(() => {
    if (!activeUserId) return;

    const load = () => fetchNotifications(activeUserId);
    load();
    const interval = setInterval(load, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [activeUserId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async (uid: string) => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/notifications?userId=${uid}`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  const markAsRead = async (id: string, link?: string) => {
    try {
        setLoading(true);
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId: id, userId: activeUserId })
        });
        
        // Optimistic update
        setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));

        if (link) {
            router.push(link);
            setOpen(false);
        }
    } catch (error) {
        console.error('Failed to mark read', error);
    } finally {
        setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
        setLoading(true);
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markAllRead: true, userId })
        });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    } catch (error) {
        console.error('Failed to mark all read', error);
    } finally {
        setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-slate-700/50 transition-colors text-gray-300 hover:text-white"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-3 w-3 bg-red-500 rounded-full border border-slate-900 shadow"></span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-white font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>No notifications</p>
              </div>
            ) : (
              <div>
                {notifications.map((notif) => (
                  <div 
                    key={notif._id}
                    className={`p-4 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer ${
                      !notif.read ? 'bg-purple-900/10' : ''
                    }`}
                    onClick={() => markAsRead(notif._id, notif.link)}
                  >
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className={`text-sm font-semibold ${!notif.read ? 'text-white' : 'text-gray-400'}`}>
                            {notif.title}
                          </h4>
                          <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                            {formatDate(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 leading-snug line-clamp-2">
                          {notif.message}
                        </p>
                      </div>
                      {!notif.read && (
                        <div className="h-2 w-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
