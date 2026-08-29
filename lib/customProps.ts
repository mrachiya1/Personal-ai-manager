// User-added Notion properties, rendered as extra table columns.
//
// The Projects database belongs to the person using it, not to this app. They
// will add columns — a URL for the staging site, a checkbox for "invoiced", a
// select for whose fault the delay was — and a table that ignores anything it
// wasn't compiled to know about forces them back into Notion to see their own
// data. So the screen reads whatever is there.
//
// Only the property types with an obvious cell editor are surfaced. Formulas,
// rollups and relations are computed or structural: showing them as blank
// columns would be worse than leaving them out, so they are skipped and the
// reason is in the property picker.

/** Notion property types this table can render and edit. */
export const CUSTOM_TYPES = [
  { type: "rich_text", label: "Text", hint: "Free text", icon: "text" },
  { type: "number", label: "Number", hint: "Amounts and counts", icon: "number" },
  { type: "select", label: "Select", hint: "One option from a list", icon: "select" },
  { type: "multi_select", label: "Multi-select", hint: "Several options", icon: "tags" },
  { type: "status", label: "Status", hint: "Grouped stages", icon: "status" },
  { type: "date", label: "Date", hint: "A day or a range", icon: "date" },
  { type: "people", label: "Person", hint: "Notion workspace members", icon: "person" },
  { type: "files", label: "Files & media", hint: "Attachments and links", icon: "files" },
  { type: "checkbox", label: "Checkbox", hint: "Yes or no", icon: "checkbox" },
  { type: "url", label: "URL", hint: "A web address", icon: "link" },
  { type: "email", label: "Email", hint: "An address", icon: "email" },
  { type: "phone_number", label: "Phone", hint: "A number to call", icon: "phone" },
] as const;

export type CustomType = (typeof CUSTOM_TYPES)[number]["type"];

/** Properties this screen already owns — never offered as "custom". */
export const RESERVED_PROPERTY_NAMES = new Set([
  "Name", "Company", "Client", "Category", "Status", "Description", "Deadline",
  "Render Priority", "Estimated Render Time (hrs)", "Assigned To", "Start Date",
  "Value", "Headline", "Client Requests", "Last Reviewed", "Reviewed By", "Files",
  "Completion Feel", "Completion Note", "Completed On",
]);

/** Types we can read but not create here — surfaced read-only if present. */
const READ_ONLY_TYPES = new Set(["formula", "rollup", "created_time", "last_edited_time", "created_by", "last_edited_by", "unique_id", "relation"]);

export interface CustomProperty {
  name: string;
  type: string;
  /** False for formulas and rollups: Notion computes them, so nothing to edit. */
  editable: boolean;
  options?: string[];
}

/** The Notion schema body for a new property of a given type. */
export function newPropertySchema(type: CustomType): Record<string, unknown> {
  switch (type) {
    case "number":
      return { number: { format: "number" } };
    case "select":
    case "multi_select":
      // Created with no options; Notion adds them as values are written, which
      // is the same behaviour as typing a new tag into a Notion select.
      return { [type]: { options: [] } };
    case "status":
      // Status is the one type Notion's API cannot create — it has required
      // groups the API does not expose. A plain select behaves the same in
      // this table and can be converted in Notion afterwards.
      return { select: { options: [] } };
    default:
      return { [type]: {} };
  }
}

/** Everything on the database this screen does not already own. */
export function customProperties(
  properties: Record<string, { type: string; select?: { options?: { name: string }[] }; multi_select?: { options?: { name: string }[] } }>
): CustomProperty[] {
  return Object.entries(properties)
    .filter(([name, def]) => !RESERVED_PROPERTY_NAMES.has(name) && def.type !== "title")
    .map(([name, def]) => ({
      name,
      type: def.type,
      editable: !READ_ONLY_TYPES.has(def.type),
      options: (def.select?.options ?? def.multi_select?.options ?? []).map((o) => o.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads one property off a Notion page into something a cell can render. */
export function readCustomValue(prop: unknown): string | number | boolean | string[] | undefined {
  const p = prop as Record<string, any> | undefined;
  if (!p) return undefined;
  // Real Notion always sends `type`; inferring it from the single value key
  // when it is absent costs nothing and keeps this readable against any
  // stand-in or trimmed payload.
  const kind: string = p.type ?? Object.keys(p).find((k) => k !== "id") ?? "";
  switch (kind) {
    case "rich_text":
    case "title":
      return (p[kind] ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("") || undefined;
    case "number":
      return p.number ?? undefined;
    case "select":
    case "status":
      return p[kind]?.name ?? undefined;
    case "multi_select":
      return (p.multi_select ?? []).map((o: any) => o.name);
    case "date":
      return p.date?.start ?? undefined;
    case "checkbox":
      return Boolean(p.checkbox);
    case "url":
    case "email":
    case "phone_number":
      return p[kind] ?? undefined;
    case "people":
      return (p.people ?? []).map((u: any) => u.name || u.id);
    case "files":
      return (p.files ?? []).map((f: any) => f.name);
    case "formula":
      return p.formula?.string ?? p.formula?.number ?? (p.formula?.boolean === undefined ? undefined : p.formula.boolean);
    case "rollup":
      return p.rollup?.number ?? undefined;
    case "created_time":
    case "last_edited_time":
      return p[kind] ?? undefined;
    case "unique_id":
      return p.unique_id ? `${p.unique_id.prefix ?? ""}${p.unique_id.number}` : undefined;
    default:
      return undefined;
  }
}

/** Builds the write body for one custom property. */
export function writeCustomValue(type: string, value: string | number | boolean | string[] | undefined): unknown {
  switch (type) {
    case "rich_text":
      return { rich_text: value ? [{ text: { content: String(value) } }] : [] };
    case "number":
      return { number: value === undefined || value === "" ? null : Number(value) };
    case "select":
    case "status":
      return { [type]: value ? { name: String(value) } : null };
    case "multi_select":
      return { multi_select: (Array.isArray(value) ? value : []).filter(Boolean).map((name) => ({ name })) };
    case "date":
      return { date: value ? { start: String(value) } : null };
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "url":
    case "email":
    case "phone_number":
      return { [type]: value ? String(value) : null };
    default:
      return null;
  }
}
