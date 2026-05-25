import { Navigate, Route, Routes } from 'react-router-dom';
import TabBar from './components/TabBar';
import { useAuth } from './lib/auth';
import { supabaseConfigured } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import TodayPage from './pages/TodayPage';
import RecordsPage from './pages/RecordsPage';
import AnalysisPage from './pages/AnalysisPage';
import PromptsPage from './pages/PromptsPage';
import SetupNotice from './pages/SetupNotice';

export default function App() {
  const { user, loading } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="app-shell">
        <SetupNotice />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <span className="dots"><span /><span /><span /></span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <AuthPage />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
      <TabBar />
    </div>
  );
}
