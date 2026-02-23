import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ClubReader } from "@/components/reader/ClubReader";
import { ReaderWorkspace } from "@/components/reader/ReaderWorkspace";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailVerificationModal } from "@/components/ui/email-verification-modal";
import { AuthProvider } from "@/hooks/use-auth";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminAudit from "@/pages/admin/audit";
import AdminBooks from "@/pages/admin/books";
import AdminClubs from "@/pages/admin/clubs";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminKPI from "@/pages/admin/kpi";
import AdminReports from "@/pages/admin/reports";
import AdminSettings from "@/pages/admin/settings";
import AdminUsers from "@/pages/admin/users";
import ConfirmEmail from "@/pages/auth/confirm-email";
import ForgotPassword from "@/pages/auth/forgot-password";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ResetPassword from "@/pages/auth/reset-password";
import BecomeReader from "@/pages/become-reader";
import Catalog from "@/pages/catalog";
import ClubDetails from "@/pages/club-details";
import CreateClub from "@/pages/clubs/create-club";
import MyClubs from "@/pages/clubs/my-clubs";
import Home from "@/pages/home";
import InviteAccept from "@/pages/invite-accept";
import Library from "@/pages/library";
import NotFound from "@/pages/not-found";
import ProfilePage from "@/pages/ProfilePage";
import Pricing from "@/pages/pricing";
import ReaderStudio from "@/pages/reader-studio";
import Readers from "@/pages/readers";
import { queryClient } from "./lib/queryClient";
import { YandexMetrikaTracker } from "./lib/yandexMetrika";

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
            <Router />
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
