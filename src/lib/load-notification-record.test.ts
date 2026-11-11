import {expect,it,vi} from "vitest";
import {loadNotificationRecord} from "./load-notification-record";
it.each(["production","marketing"] as const)("loads a not-yet-cached job using the current %s account",async mode=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({pipelineJobs:[{id:"wanted",title:"Followed job"}]})));
  expect((await loadNotificationRecord("job","wanted",mode,fetcher)).selected).toMatchObject({kind:"job",record:{id:"wanted"}});
  expect(fetcher).toHaveBeenCalledWith(`/api/autopacific/tab?view=jobs&mode=${mode}`,expect.objectContaining({credentials:"same-origin",cache:"no-store"}));
});
it("loads task details separately and does not confuse a task ID with a job",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({pipelineTasks:[{id:"wanted",title:"Followed task"}]})));
  expect((await loadNotificationRecord("task","wanted","marketing",fetcher)).selected.kind).toBe("task");
});
it("never opens a stale or unavailable record as a fallback",async()=>{
  await expect(loadNotificationRecord("job","missing","production",async()=>new Response(JSON.stringify({pipelineJobs:[]})))).rejects.toThrow("no longer available");
});
it("keeps authentication and transient failures actionable",async()=>{
  await expect(loadNotificationRecord("job","id","production",async()=>new Response("",{status:401}))).rejects.toThrow("Sign in");
  await expect(loadNotificationRecord("job","id","production",async()=>new Response("",{status:503}))).rejects.toThrow("try again");
});
