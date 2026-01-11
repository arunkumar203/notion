'use client';

import { useRouter } from 'next/navigation';
import { FiMessageSquare } from 'react-icons/fi';

export default function ChatButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/chat')}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
      title="AI Chat"
    >
      <FiMessageSquare className="h-4 w-4" />
      <span className="hidden sm:inline">Chat</span>
    </button>
  );
}
