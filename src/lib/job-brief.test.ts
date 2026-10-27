import { describe,expect,it } from "vitest";
import { briefAsMarkdown,jobBriefSchema } from "./job-brief";
describe("production brief",()=>{
 it("allows an empty planning brief",()=>expect(jobBriefSchema.parse({})).toEqual({}));
 it("rejects repeated modules",()=>expect(jobBriefSchema.safeParse({sections:[{key:"shot_list",body:"A"},{key:"shot_list",body:"B"}]}).success).toBe(false));
 it("rejects unknown modules and oversized content",()=>{expect(jobBriefSchema.safeParse({sections:[{key:"custom_script",body:"No"}]}).success).toBe(false);expect(jobBriefSchema.safeParse({objective:"x".repeat(2001)}).success).toBe(false);});
 it("only exports populated modules",()=>{const output=briefAsMarkdown({objective:"Show the product",sections:[{key:"shot_list",body:"Hero shot"},{key:"creative_direction",body:""}]});expect(output).toContain("**Objective**");expect(output).toContain("Hero shot");expect(output).not.toContain("Creative direction");});
});
