import { useParams } from "wouter";
import { Loader2 } from "lucide-react";
import ClubDetails from "@/pages/club-details";
import ReaderClubDetails from "@/pages/reader-club-details";
import { MainLayout } from "@/components/layout/MainLayout";
import { useClub } from "@/hooks/use-clubs";
import { useAuth } from "@/hooks/use-auth";

function ClubRouteLoading() {
  return (
    <MainLayout>
      <div className="container flex items-center justify-center px-4 py-12 text-sm text-muted-foreground sm:px-6 md:px-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Загружаем клуб...
      </div>
    </MainLayout>
  );
}

export default function ClubRoute() {
  const params = useParams<{ id?: string }>();
  const clubId = params.id || "";
  const { isLoading: authLoading } = useAuth();
  const { data: club, isLoading } = useClub(clubId, !!clubId && !authLoading);

  if (authLoading || isLoading) {
    return <ClubRouteLoading />;
  }

  if (club?.type === "reader-led") {
    return <ReaderClubDetails clubId={clubId} initialClub={club} />;
  }

  return <ClubDetails />;
}
