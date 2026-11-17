import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { PageLoader } from './components/ui';
import Landing from './pages/Landing';
import { Forgot, Login, Register, Reset, VerifyEmail } from './pages/Auth';
import PublicVehicle from './pages/PublicVehicle';
import { Abuse, NotFound, Privacy } from './pages/Static';

const OwnerLayout = lazy(() => import('./pages/owner/Layout'));
const Summary = lazy(() => import('./pages/owner/Summary'));
const Vehicles = lazy(() => import('./pages/owner/Vehicles'));
const Reports = lazy(() => import('./pages/owner/Reports'));
const ReportDetailPage = lazy(() => import('./pages/owner/ReportDetail'));
const Calls = lazy(() => import('./pages/owner/Calls'));
const Notifications = lazy(() => import('./pages/owner/Notifications'));
const Settings = lazy(() => import('./pages/owner/Settings'));
const AdminLayout = lazy(() => import('./pages/admin/Admin'));

function ScrollTop() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; }

function RequireAuth({ admin }: { admin?: boolean }) {
  const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={admin ? '/admin/login' : '/login'} state={{ from: loc.pathname }} replace />;
  if (admin && !user.is_admin) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<Login admin />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<Forgot />} />
          <Route path="/reset-password" element={<Reset />} />
          <Route path="/v/:token" element={<PublicVehicle />} />
          <Route path="/privasi" element={<Privacy />} />
          <Route path="/penyalahgunaan" element={<Abuse />} />

          <Route element={<RequireAuth />}>
            <Route path="/app" element={<OwnerLayout />}>
              <Route index element={<Summary />} />
              <Route path="vehicles" element={<Vehicles />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/:id" element={<ReportDetailPage />} />
              <Route path="calls" element={<Calls />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route element={<RequireAuth admin />}>
            <Route path="/admin/*" element={<AdminLayout />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
