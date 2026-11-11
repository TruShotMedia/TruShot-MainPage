import type {PipelineTask,TabletJobRecord,TabletKioskData} from "./types";
/** Fetch the authorised record before opening it. A lazy/unloaded tab must not
 * make an inbox click silently fail or acknowledge an unseen update. */
export async function loadNotificationRecord(kind:"job"|"task",id:string,mode:"production"|"marketing",fetcher=fetch) {
  const response=await fetcher(`/api/autopacific/tab?view=${kind==="job"?"jobs":"tasks"}&mode=${mode}`,{cache:"no-store",credentials:"same-origin"});
  if(!response.ok)throw new Error(response.status===401?"Sign in again to open this update.":"This item could not be loaded. Please try again.");
  const payload=await response.json() as Partial<TabletKioskData>;
  if(kind==="job") {
    const record=payload.pipelineJobs?.find(item=>item.id===id);
    if(!record)throw new Error("This job is no longer available to your account.");
    return {payload,selected:{kind:"job" as const,record:record as TabletJobRecord}};
  }
  const record=payload.pipelineTasks?.find(item=>item.id===id);
  if(!record)throw new Error("This task is no longer available to your account.");
  return {payload,selected:{kind:"task" as const,record:record as PipelineTask}};
}
