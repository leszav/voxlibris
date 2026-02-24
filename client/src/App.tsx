import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Suspense, lazy, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailVerificationModal } from "@/components/ui/email-verification-modal";
import { AuthProvider } from "@/hooks/use-auth";
import { queryClient } from "./lib/queryClient";
import { YandexMetrikaTracker } from "./lib/yandexMetrika";

const Home = lazy(() => import("@/pages/home"));
const Catalog = lazy(() => import("@/pages/catalog"));
const ReaderStudio = lazy(() => import("@/pages/reader-studio"));
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
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const Readers = lazy(() => import("@/pages/readers"));
const Library = lazy(() => import("@/pages/library"));
const Pricing = lazy(() => import("@/pages/pricing"));
const BecomeReader = lazy(() => import("@/pages/become-reader"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ReaderWorkspace = lazy(() =>
  import("@/components/reader/ReaderWorkspace").then((module) => ({
    default: module.ReaderWorkspace,
  })),
);
const ClubReader = lazy(() =>
  import("@/components/reader/ClubReader").then((module) => ({
    default: module.ClubReader,
  })),
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/reader-studio" component={ReaderStudio} />

      {/* Club Routes */}
      <Route path="/clubs" component={MyClubs} />
      <Route path="/clubs/create" component={CreateClub} />
      <Route path="/clubs/:id" component={ClubDetails} />
      {/* Legacy route for compatibility */}
      <Route path="/club/:id" component={ClubDetails} />

      {/* Reader Routes */}
      <Route path="/books/:bookId/read" component={ReaderWorkspace} />
      <Route path="/clubs/:clubId/books/:bookId/read" component={ClubReader} />

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

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Загрузка страницы...
    </div>
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
            <Suspense fallback={<RouteLoadingFallback />}>
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
