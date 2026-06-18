import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import ToastContainer from '../../feedback/Toast/Toast';
import { getAdminSocket, disconnectAdminSocket } from '../../../services/socket';

export default function AdminLayout() {
  useEffect(() => {
    const socket = getAdminSocket();
    socket.connect();
    return () => disconnectAdminSocket();
  }, []);

  // dir is driven globally by LanguageProvider on <html> — no hardcoded dir here
  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminTopBar />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
