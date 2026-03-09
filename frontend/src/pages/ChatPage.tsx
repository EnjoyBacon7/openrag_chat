import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../store';
import Sidebar from '../components/sidebar/Sidebar';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';
import NotificationBanner from '../components/notifications/NotificationBanner';

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);

  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
    } else {
      setActiveConversation(null);
    }
  }, [conversationId, setActiveConversation]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader />
        <NotificationBanner />
        <MessageList />
        <MessageInput />
      </div>
    </div>
  );
}
