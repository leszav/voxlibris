import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canClubMemberWrite, isClubMemberDeactivated, isClubMemberMuted } from "../lib/club-member-moderation.ts";

describe("Club member moderation helpers", () => {
  const now = new Date("2026-06-19T08:00:00.000Z");

  it("разрешает write активному участнику без ограничений", () => {
    assert.equal(canClubMemberWrite({ isActive: true, mutedUntil: null, deactivatedUntil: null }, now), true);
  });

  it("блокирует write при активном mute", () => {
    const member = { isActive: true, mutedUntil: new Date("2026-06-19T09:00:00.000Z"), deactivatedUntil: null };

    assert.equal(isClubMemberMuted(member, now), true);
    assert.equal(canClubMemberWrite(member, now), false);
  });

  it("не блокирует write при истёкшем mute", () => {
    const member = { isActive: true, mutedUntil: new Date("2026-06-19T07:00:00.000Z"), deactivatedUntil: null };

    assert.equal(isClubMemberMuted(member, now), false);
    assert.equal(canClubMemberWrite(member, now), true);
  });

  it("блокирует write при ручной и временной деактивации", () => {
    assert.equal(isClubMemberDeactivated({ isActive: false, deactivatedUntil: null }, now), true);
    assert.equal(canClubMemberWrite({ isActive: true, mutedUntil: null, deactivatedUntil: new Date("2026-06-19T09:00:00.000Z") }, now), false);
  });
});
