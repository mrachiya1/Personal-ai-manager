// The Notion properties the Tasks database needs once tasks can nest.
//
// The Tasks database shipped flat: Title, Project, Status, Due Date, Tags. A
// tree needs one thing that isn't there — a task pointing at its parent task —
// and the row the design asks for needs five more: a thumbnail, a priority, a
// start date so a task has a range rather than a deadline, the people on it,
// and its own resource links.
//
// Same contract as lib/projectSchema.ts: strictly additive. This only ever
// POSTs properties that are missing. It never renames, retypes or removes one,
// so pointing it at a database that already has some of these is a no-op for
// those, and someone who named their column differently keeps their column.

export type TaskPropKind = "date" | "rich_text" | "relation" | "self_relation" | "files" | "select";

export interface RequiredTaskProp {
  /** Exact Notion property name. */
  name: string;
  kind: TaskPropKind;
  /** For relations: which database in the user's mapping to point at. */
  relatesTo?: "team" | "tasks";
  options?: string[];
  purpose: string;
}

export const TASK_PRIORITY_OPTIONS = ["Urgent", "High", "Normal", "Low"];

export const REQUIRED_TASK_PROPS: RequiredTaskProp[] = [
  {
    name: "Parent Task",
    kind: "self_relation",
    relatesTo: "tasks",
    purpose:
      "Points a task at the task it belongs to. This is what makes milestones, sub-tasks and sub-items one tree instead of three hardcoded levels",
  },
  { name: "Thumbnail", kind: "files", purpose: "The preview image shown to the left of the task name" },
  { name: "Start Date", kind: "date", purpose: "So a task has a range rather than only a deadline" },
  { name: "Priority", kind: "select", options: TASK_PRIORITY_OPTIONS, purpose: "Sorting and the priority chip on the row" },
  { name: "Assigned To", kind: "relation", relatesTo: "team", purpose: "Who is on it — drives the assignee dots" },
  { name: "Files", kind: "files", purpose: "Resource links and attachments for this task specifically" },
];

/** The Notion property-schema body for one required property. */
export function taskPropertySchema(
  prop: RequiredTaskProp,
  targets: { team: string; tasks: string }
): Record<string, unknown> {
  switch (prop.kind) {
    case "date":
      return { date: {} };
    case "rich_text":
      return { rich_text: {} };
    case "files":
      return { files: {} };
    case "select":
      return { select: { options: (prop.options ?? []).map((name) => ({ name })) } };
    case "relation":
      return { relation: { database_id: targets.team, single_property: {} } };
    case "self_relation":
      // A relation from the Tasks database to itself. single_property keeps it
      // one-way: a dual_property self-relation would add a second "Sub-tasks"
      // column to the same database, and two columns describing one edge is
      // how a tree ends up disagreeing with itself.
      return { relation: { database_id: targets.tasks, single_property: {} } };
  }
}

const NOTION_TYPE_FOR: Record<TaskPropKind, string> = {
  date: "date",
  rich_text: "rich_text",
  relation: "relation",
  self_relation: "relation",
  files: "files",
  select: "select",
};

export interface TaskSchemaCheck {
  name: string;
  present: boolean;
  kind: TaskPropKind;
  purpose: string;
  typeMismatch?: string;
}

export function checkTaskSchema(
  properties: Record<string, { type: string }> = {}
): TaskSchemaCheck[] {
  return REQUIRED_TASK_PROPS.map((prop) => {
    const existing = properties[prop.name];
    if (!existing) return { name: prop.name, present: false, kind: prop.kind, purpose: prop.purpose };
    const wanted = NOTION_TYPE_FOR[prop.kind];
    return {
      name: prop.name,
      present: true,
      kind: prop.kind,
      purpose: prop.purpose,
      typeMismatch: existing.type === wanted ? undefined : `exists as "${existing.type}", expected "${wanted}"`,
    };
  });
}
