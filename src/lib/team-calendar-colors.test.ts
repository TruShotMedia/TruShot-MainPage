import { describe, expect, it } from "vitest";
import { assignTeamCalendarColors, calendarAssignedMembers, calendarTeamAttributes } from "./team-calendar-colors";
import type { TeamMember } from "./production-team";

const members: TeamMember[] = Array.from({ length: 12 }, (_, index) => ({
  user_id: `person-${index}`, display_name: `Person ${index}`, username: `person${index}`,
  role: "marketing", is_active: true, avatar_color: "#579",
}));
describe("team calendar identity colours", () => {
  it("gives teammates distinct colours without changing their profile colours", () => {
    const result = assignTeamCalendarColors(members);
    expect(new Set(result.map(member => member.color)).size).toBe(members.length);
    expect(members.every(member => member.avatar_color === "#579")).toBe(true);
  });
  it("is stable across directory ordering and repeated loads", () => {
    const mapping = (value: TeamMember[]) => Object.fromEntries(assignTeamCalendarColors(value).map(member => [member.user_id, member.color]));
    expect(mapping([...members].reverse())).toEqual(mapping(members));
    expect(mapping(members)).toEqual(mapping(members));
  });
  it("omits hidden people and does not duplicate a person", () => {
    expect(assignTeamCalendarColors([members[0], members[0], { ...members[1], is_active: false }])).toHaveLength(1);
  });
  it("keeps all assignees on shared work and ignores unavailable users", () => {
    const key = assignTeamCalendarColors(members);
    const record = { assignee_ids: [members[1].user_id, members[0].user_id, members[0].user_id, "hidden"] };
    expect(calendarAssignedMembers(record, key).map(member => member.user_id)).toEqual([members[0].user_id, members[1].user_id]);
    const attributes = calendarTeamAttributes(record, key);
    expect(attributes["aria-description"]).toBe("Assigned to Person 0, Person 1");
    expect(attributes.style).toMatchObject({ "--team-calendar-color": key[0].color });
    expect(JSON.stringify(attributes.style)).toContain(key[1].color);
  });
  it("does not colour other calendar spaces or unassigned items", () => {
    expect(calendarTeamAttributes({ assignee_ids: ["person-0"] }, [])).toEqual({});
    expect(calendarTeamAttributes({}, assignTeamCalendarColors(members))).toEqual({});
  });
});
