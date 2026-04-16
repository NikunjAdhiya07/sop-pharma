/**
 * Copy Protection Utility
 * Prevents copying, downloading, and right-click on protected content
 * Screenshot protection removed to prevent flickering
 */

import { useEffect } from 'react';

/**
 * Apply copy/inspect protection. Pass enabled=false to disable all restrictions.
 */
export function useCopyProtection(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    // Disable right-click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Keyboard blocking for Copy/Cut/Save/Print
    const handleKeyDown = (e: KeyboardEvent) => {
      // Copy, Cut, Paste, Select All, Save, Print
      if ((e.ctrlKey || e.metaKey) &&
          ['c', 'C', 'x', 'X', 'v', 'V', 'a', 'A', 's', 'S', 'p', 'P'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Developer Tools
      if (e.key === 'F12' ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) ||
          ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key))) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Disable copy/cut/paste events
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Disable drag
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    // Prevent selection
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // Add all event listeners
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('selectstart', handleSelectStart, true);

    // Prevent text selection via CSS
    const originalUserSelect = document.body.style.userSelect;
    const originalWebkitUserSelect = document.body.style.webkitUserSelect;

    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    (document.body.style as any).mozUserSelect = 'none';
    (document.body.style as any).msUserSelect = 'none';

    // Cleanup
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('selectstart', handleSelectStart, true);

      document.body.style.userSelect = originalUserSelect;
      document.body.style.webkitUserSelect = originalWebkitUserSelect;
      (document.body.style as any).mozUserSelect = '';
      (document.body.style as any).msUserSelect = '';
    };
  }, [enabled]);
}

/**
 * CSS class names for copy-protected content
 */
export const copyProtectionClasses = 'select-none pointer-events-auto';

/**
 * Inline styles for copy protection
 */
export const copyProtectionStyles: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

/**
 * Component wrapper for copy-protected content
 */
interface CopyProtectedProps {
  children: React.ReactNode;
  className?: string;
}

export function CopyProtected({ children, className = '' }: CopyProtectedProps) {
  return (
    <div
      className={`${copyProtectionClasses} ${className}`}
      style={copyProtectionStyles}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
