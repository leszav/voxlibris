import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Redirect } from "wouter";
import { Suspense, lazy, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailVerificationModal } from "@/components/ui/email-verification-modal";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Home from "@/pages/home";
import { queryClient } from "./lib/queryClient";
import { YandexMetrikaTracker } from "./lib/yandexMetrika";

const Catalog = lazy(() => import("@/pages/catalog"));
const ReaderStudio = lazy(() => import("@/pages/reader-studio"));
const GuestLibrary = lazy(() => import("@/pages/guest-library"));
const GuestReader = lazy(() => import("@/pages/guest-reader"));
const MyClubs = lazy(() => import("@/pages/clubs/my-clubs"));
const CreateClub = lazy(() => import("@/pages/clubs/create-club"));
const ClubDetails = lazy(() => import("@/pages/club-details"));
const Login = lazy(() => import("@/pages/auth/login"));
const Register = lazy(() => import("@/pages/auth/register"));
const ForgotPassword = lazy(() => import("@/pages/auth/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/auth/reset-password"));
const ConfirmEmail = lazy(() => import("@/pages/auth/confirm-email"));
const InviteAccept = lazy(() => import("@/pages/invite-accept"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminBooks = lazy(() => import("@/pages/admin/books"));
const AdminClubs = lazy(() => import("@/pages/admin/clubs"));
const AdminReports = lazy(() => import("@/pages/admin/reports"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminKPI = lazy(() => import("@/pages/admin/kpi"));
const AdminAudit = lazy(() => import("@/pages/admin/audit"));
const AdminRecordings = lazy(() => import("@/pages/admin/recordings"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const Readers = lazy(() => import("@/pages/readers"));
const Library = lazy(() => import("@/pages/library"));
const Pricing = lazy(() => import("@/pages/pricing"));
const BecomeReader = lazy(() => import("@/pages/become-reader"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ReaderWorkspacePage = lazy(async () => ({
  default: (await import("@/components/reader/ReaderWorkspace")).ReaderWorkspace,
}));
const ClubReaderPage = lazy(async () => ({
  default: (await import("@/components/reader/ClubReader")).ClubReader,
}));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Загружаем страницу...
    </div>
  );
}

/**
 * Защищённый маршрут — перенаправляет на /auth/login если пользователь
 * не аутентифицирован. Пока идёт загрузка состояния auth — показывает
 * заглушку (не редиректит, чтобы не сбрасывать URL при refresh-токене).
 */
function ProtectedRoute({ component: Component }: Readonly<{ component: React.ComponentType }>) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <RouteFallback />;
  if (!isAuthenticated) return <Redirect to="/auth/login" />;
  return <Component />;
}

// Именованные обёртки для защищённых маршрутов — вынесены на уровень модуля,
// чтобы не создавать компоненты внутри компонента (S6478).
const ProtectedStudio          = () => <ProtectedRoute component={ReaderStudio} />;
const ProtectedMyClubs         = () => <ProtectedRoute component={MyClubs} />;
const ProtectedCreateClub      = () => <ProtectedRoute component={CreateClub} />;
const ProtectedReaderWorkspace = () => <ProtectedRoute component={ReaderWorkspacePage} />;
const ProtectedClubReader      = () => <ProtectedRoute component={ClubReaderPage} />;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/studio/:clubId/:bookId/:chapter?" component={ProtectedStudio} />

      {/* Guest Routes */}
      <Route path="/guest/library" component={GuestLibrary} />
      <Route path="/guest/reader/:bookId" component={GuestReader} />

      {/* Club Routes */}
      <Route path="/clubs" component={ProtectedMyClubs} />
      <Route path="/clubs/create" component={ProtectedCreateClub} />
      <Route path="/clubs/:id" component={ClubDetails} />
      {/* Legacy route for compatibility */}
      <Route path="/club/:id" component={ClubDetails} />

      {/* Reader Routes */}
      <Route path="/books/:bookId/read" component={ProtectedReaderWorkspace} />
      <Route path="/clubs/:clubId/books/:bookId/read" component={ProtectedClubReader} />

      {/* Authentication Routes */}
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/register" component={Register} />
      <Route path="/auth/forgot-password" component={ForgotPassword} />
      <Route path="/auth/reset-password/:token" component={ResetPassword} />
      <Route path="/confirm-email/:token" component={ConfirmEmail} />

      {/* Invitation Routes */}
      <Route path="/invite/:token" component={InviteAccept} />

      {/* Admin Routes */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/books" component={AdminBooks} />
      <Route path="/admin/clubs" component={AdminClubs} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/kpi" component={AdminKPI} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/admin/recordings" component={AdminRecordings} />
      <Route path="/admin/settings" component={AdminSettings} />

      {/* Implemented Pages */}
      <Route path="/readers" component={Readers} />
      <Route path="/library" component={Library} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/become-reader" component={BecomeReader} />

      {/* Profile Page */}
      <Route path="/profile" component={ProfilePage} />
      <Route path="/profile/:id" component={ProfilePage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);

  useEffect(() => {
    const handleEmailVerificationRequired = () => {
      setShowEmailVerificationModal(true);
    };

    globalThis.addEventListener('email-verification-required', handleEmailVerificationRequired);
    
    return () => {
      globalThis.removeEventListener('email-verification-required', handleEmailVerificationRequired);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <TooltipProvider>
            <Toaster />
            {/* Отслеживание просмотров страниц в Яндекс.Метрике для SPA */}
            <YandexMetrikaTracker />
            <Suspense fallback={<RouteFallback />}>
              <Router />
            </Suspense>
            <EmailVerificationModal 
              isOpen={showEmailVerificationModal}
              onClose={() => setShowEmailVerificationModal(false)}
            />
          </TooltipProvider>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
