-- Исправляем оставшиеся foreign key constraints для корректного cascade delete
ALTER TABLE "club_tags" DROP CONSTRAINT "club_tags_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT "club_members_club_id_clubs_id_fk";
--> statement-breakpoint

ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;