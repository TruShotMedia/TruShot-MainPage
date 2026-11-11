type Subscription = { user_id?: string; client_scope_id?: string | null };
/** App registration and personal interest are independent requirements.
 * TruShot devices never receive AutoPacific work, even for an assigned admin. */
export function receivesProductionReminder({ subscription, experience, clientIsAutopacific, allowedUsers, assignees, followers }: {
  subscription: Subscription; experience?: "autopacific" | "trushot"; clientIsAutopacific: boolean;
  allowedUsers: ReadonlySet<string>; assignees: readonly string[]; followers: readonly string[];
}) {
  if(experience!=="autopacific")return !subscription.client_scope_id;
  const user=subscription.user_id;
  return Boolean(user && allowedUsers.has(user)
    && Boolean(subscription.client_scope_id) && clientIsAutopacific
    && (assignees.includes(user)||followers.includes(user)));
}
export function reminderFollowKey(kind:string,id:string) {
  return kind==="job_start"||kind==="job_due"?`job:${id}`:kind==="task_due"?`task:${id}`:null;
}
