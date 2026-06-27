import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Redirect } from "wouter";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailVerificationModal } from "@/components/ui/email-verification-modal";
import { UsernameFixBanner } from "@/components/ui/username-fix-banner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Home from "@/pages/home";
import { queryClient } from "./lib/queryClient";
import { YandexMetrikaTracker } from "./lib/yandexMetrika";

const Catalog = lazy(() => import("@/pages/catalog"));
const GuestLibrary = lazy(() => import("@/pages/guest-library"));
const GuestReader = lazy(() => import("@/pages/guest-reader"));
const MyClubs = lazy(() => import("@/pages/clubs/my-clubs"));
const CreateClub = lazy(() => import("@/pages/clubs/create-club"));
const ClubRoute = lazy(() => import("@/pages/club-route"));
const Login = lazy(() => import("@/pages/auth/login"));
const Register = lazy(() => import("@/pages/auth/register"));
const OnboardingGenres = lazy(() => import("@/pages/auth/onboarding-genres"));
const ForgotPassword = lazy(() => import("@/pages/auth/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/auth/reset-password"));
const ConfirmEmail = lazy(() => import("@/pages/auth/confirm-email"));
const InviteAccept = lazy(() => import("@/pages/invite-accept"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminBooks = lazy(() => import("@/pages/admin/books"));
const AdminGenres = lazy(() => import("@/pages/admin/genres"));
const AdminClubs = lazy(() => import("@/pages/admin/clubs"));
const AdminReports = lazy(() => import("@/pages/admin/reports"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminKPI = lazy(() => import("@/pages/admin/kpi"));
const AdminAudit = lazy(() => import("@/pages/admin/audit"));
const AdminGamification = lazy(() => import("@/pages/admin/gamification"));
const AdminRecordings = lazy(() => import("@/pages/admin/recordings"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const AdminPaymentProviders = lazy(() => import("@/pages/admin/payment-providers"));
const AdminTariffConstructor = lazy(() => import("@/pages/admin/tariff-constructor"));
const AdminSubscriptions = lazy(() => import("@/pages/admin/subscriptions"));
const Readers = lazy(() => import("@/pages/readers"));
const Library = lazy(() => import("@/pages/library"));
const Pricing = lazy(() => import("@/pages/pricing"));
const BecomeReader = lazy(() => import("@/pages/become-reader"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const PublicProfilePage = lazy(() => import("@/pages/PublicProfilePage"));
const DiscoverPage = lazy(() => import("@/pages/DiscoverPage"));
const FeedPage = lazy(() => import("@/pages/FeedPage"));
const BookDetailsPage = lazy(() => import("@/pages/BookDetailsPage"));
const PaymentSuccessPage = lazy(() => import("@/pages/payment-success"));
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
const ProtectedMyClubs         = () => <ProtectedRoute component={MyClubs} />;
const ProtectedCreateClub      = () => <ProtectedRoute component={CreateClub} />;
const ProtectedReaderWorkspace = () => <ProtectedRoute component={ReaderWorkspacePage} />;
const ProtectedClubReader      = () => <ProtectedRoute component={ClubReaderPage} />;
const ProtectedDashboard       = () => <ProtectedRoute component={DashboardPage} />;
const ProtectedFeed            = () => <ProtectedRoute component={FeedPage} />;
const ProtectedOnboardingGenres = () => <ProtectedRoute component={OnboardingGenres} />;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/catalog" component={Catalog} />

      {/* Guest Routes */}
      <Route path="/guest/library" component={GuestLibrary} />
      <Route path="/guest/reader/:bookId" component={GuestReader} />

      {/* Activity Feed */}
      <Route path="/feed" component={ProtectedFeed} />

      {/* Personal Dashboard */}
      <Route path="/dashboard" component={ProtectedDashboard} />

      {/* Club Routes */}
      <Route path="/clubs" component={ProtectedMyClubs} />
      <Route path="/clubs/create" component={ProtectedCreateClub} />
      <Route path="/clubs/:id" component={ClubRoute} />
      {/* Legacy route for compatibility */}
      <Route path="/club/:id" component={ClubRoute} />

      {/* Book Routes */}
      <Route path="/books/:id" component={BookDetailsPage} />
      <Route path="/books/:bookId/read" component={ProtectedReaderWorkspace} />
      <Route path="/clubs/:clubId/books/:bookId/read" component={ProtectedClubReader} />

      {/* Authentication Routes */}
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/register" component={Register} />
      <Route path="/onboarding/genres" component={ProtectedOnboardingGenres} />
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
      <Route path="/admin/genres" component={AdminGenres} />
      <Route path="/admin/clubs" component={AdminClubs} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/kpi" component={AdminKPI} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/admin/gamification" component={AdminGamification} />
      <Route path="/admin/recordings" component={AdminRecordings} />
      <Route path="/admin/payment-providers" component={AdminPaymentProviders} />
      <Route path="/admin/tariff-constructor" component={AdminTariffConstructor} />
      <Route path="/admin/subscriptions" component={AdminSubscriptions} />
      <Route path="/admin/reader-club-tariffs" component={AdminTariffConstructor} />
      <Route path="/admin/settings" component={AdminSettings} />

      {/* Implemented Pages */}
      <Route path="/readers" component={Readers} />
      <Route path="/library" component={Library} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/become-reader" component={BecomeReader} />
      <Route path="/payment/success" component={PaymentSuccessPage} />

      {/* Profile Page */}
      <Route path="/profile" component={ProfilePage} />
      <Route path="/profile/:id" component={ProfilePage} />
      <Route path="/users/:id" component={PublicProfilePage} />

      {/* Discover People */}
      <Route path="/discover" component={DiscoverPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);

  const handleCloseEmailVerificationModal = useCallback(() => {
    setShowEmailVerificationModal(false);
  }, []);

  useEffect(() => {
    const handleEmailVerificationRequired = () => {
      // Не показываем модал поверх страницы подтверждения email.
      // Иначе пользователь видит «карусель»: модал + success/error экран.
      const path = globalThis.location?.pathname ?? '';
      if (path.startsWith('/confirm-email/')) {
        return;
      }
      setShowEmailVerificationModal(true);
    };

    const handleEmailVerificationCompleted = () => {
      setShowEmailVerificationModal(false);
    };

    globalThis.addEventListener('email-verification-required', handleEmailVerificationRequired);
    globalThis.addEventListener('email-verification-completed', handleEmailVerificationCompleted);
    
    return () => {
      globalThis.removeEventListener('email-verification-required', handleEmailVerificationRequired);
      globalThis.removeEventListener('email-verification-completed', handleEmailVerificationCompleted);
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
            <EmailVerificationModal isOpen={showEmailVerificationModal} onClose={handleCloseEmailVerificationModal} />
            <UsernameFixBanner />
          </TooltipProvider>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
