# Connect TruShot CRM to Notion

The integration imports missing jobs and tasks into the CRM. It does not overwrite or delete CRM records. The first scan also links matching records that were previously imported from the Notion exports, preventing duplicates. A legacy Clients database is optional.

## 1. Give the Notion connection read access

1. Open [My integrations in Notion](https://www.notion.so/profile/integrations) and select the existing internal integration.
2. Under **Capabilities**, enable **Read content**. The CRM does not need permission to update or insert Notion content.
3. In Notion, open the **Jobs** and **Tasks** databases.
4. Open the page menu, choose **Connections**, and add the integration to both databases. If both live beneath one shared parent page, sharing the parent can also provide access.

Both databases must be accessible. The old Clients database is no longer required. If a Clients database is connected later, the importer can also resolve job-to-client relations.

## 2. Copy the token and database details

Copy the integration secret from the integration's **Configuration** page. Treat it like a password: do not put it in source control, a public variable, or a chat message.

The current TruShot database IDs are already known:

- Jobs: `47b8cec5c99a4975a2d6ff1e990eb2b1`
- Tasks: `b5cdeb9c0bcb4c87833bddeeee4ca956`

The CRM accepts a full database URL, a database ID, or a data source ID and resolves it server-side.

You will need:

- the internal integration secret;
- the Jobs database ID shown above;
- the Tasks database ID shown above.

## 3. Add the variables in Vercel

Open the TruShot project in Vercel, then go to **Settings → Environment Variables**. Add:

| Variable | Value |
| --- | --- |
| `NOTION_API_TOKEN` | Internal integration secret |
| `NOTION_JOBS_DATA_SOURCE_ID` | `47b8cec5c99a4975a2d6ff1e990eb2b1` |
| `NOTION_TASKS_DATA_SOURCE_ID` | `b5cdeb9c0bcb4c87833bddeeee4ca956` |
| `NOTION_SYNC_INTERVAL_MINUTES` | `15` recommended; minimum `10` |

Only the token, Jobs ID and Tasks ID are required. The interval is optional and defaults to 15 minutes. Do not add `NOTION_CLIENTS_DATA_SOURCE_ID`; it is optional and can remain absent while no Clients database exists.

Mark the token as sensitive. Add these to **Production** and only add them to Preview or Development if those deployments should access the live Notion workspace. Do not prefix any variable with `NEXT_PUBLIC_`; the connection is server-only.

Redeploy the current production deployment after saving the variables. Vercel environment-variable changes apply to new deployments rather than an already-running deployment.

## 4. Run the first scan

1. Sign in at `/admin`.
2. Open **Settings** and find **Notion import**.
3. Confirm it shows **Connection configured**.
4. Select **Sync now**.
5. Review the created and linked totals. New imports also create a CRM notification.

After setup, authenticated `/admin` and `/tablet` page loads can request a scan. A browser-level cooldown and an atomic Supabase lock ensure the scan runs at most once per configured interval, even when several pages, tabs or devices are open.

## Import rules

- Existing CRM records are matched and linked before anything new is created.
- Existing linked records are left unchanged, so later CRM edits are preserved.
- A task's Notion **Job** relation becomes its CRM job relation.
- With no Clients source configured, newly imported jobs are left unassigned to a client for safe review. Existing matched CRM jobs keep their current client.
- If a Clients source is configured in future, a job's first Notion **Client** relation becomes its CRM client and additional client names are retained in the notes.
- Tasks without a Job relation are placed in **Unassigned Notion imports** for review.
- A task whose related job cannot be resolved is skipped and reported as a warning rather than attached to the wrong job.
- Deleted or archived Notion pages do not delete CRM data.

## Troubleshooting

- **Token rejected:** replace `NOTION_API_TOKEN` in Vercel and redeploy.
- **Read access required:** enable the integration's Read content capability.
- **Database not found:** verify the URL/ID and connect the integration to that database.
- **Task relations missing:** connect the integration to both Jobs and Tasks so task-to-job relations are visible.
- **Rate limited:** the importer respects Notion's retry response and safely tries again on a later page load.

References: [Notion internal integrations](https://developers.notion.com/guides/get-started/internal-connections), [query a data source](https://developers.notion.com/reference/query-a-data-source), [relation property values](https://developers.notion.com/reference/page-property-values), [request limits](https://developers.notion.com/reference/request-limits), and [Vercel environment variables](https://vercel.com/docs/environment-variables).
