// The Notion properties the redesigned Projects screen needs, and the code to
// add whichever ones are missing.
//
// The Projects database shipped with eight properties. The screen the owner
// asked for needs eight more — assignee, start date, value, headline, client
// requests, review tracking and a direct Client relation. Rather than hand
// someone a spec and hope they type sixteen property names correctly (one
// typo reads as a permanently blank column), the app detects what's missing
// and creates it via the Notion API.
//
// Strictly additive: this only ever POSTs new properties. It never renames,
// retypes or removes an existing one, so running it against a database that
// already has some of these is a no-op for those.

export type PropKind = "date" | "number" | "rich_text" | "relation" | "files";

export interface RequiredProp {
  /** Exact Notion property name. */
  name: string;
  kind: PropKind;
  /** For relations: which database key in the user's mapping to point at. */
  relatesTo?: "clients" | "team";
  /** Shown in the Settings UI so the person knows what they're agreeing to. */
  purpose: string;
}

export const REQUIRED_PROJECT_PROPS: RequiredProp[] = [
  { name: "Client", kind: "relation", relatesTo: "clients", purpose: "Links a project directly to a client, instead of inferring it through Payments" },
  { name: "Assigned To", kind: "relation", relatesTo: "team", purpose: "Who is working on it — drives the people column" },
  { name: "Start Date", kind: "date", purpose: "Start of the timeline column" },
  { name: "Value", kind: "number", purpose: "What the project is worth" },
  { name: "Headline", kind: "rich_text", purpose: "One-line summary shown under the project name" },
  { name: "Client Requests", kind: "rich_text", purpose: "Extra things the client has asked for" },
  { name: "Last Reviewed", kind: "date", purpose: "When the project was last checked" },
  { name: "Reviewed By", kind: "relation", relatesTo: "team", purpose: "Which staff member did that review" },
  { name: "Files", kind: "files", purpose: "Briefs, contracts, references and deliverables attached to the project" },
];

/** The Notion property-schema body for one required property. */
export function propertySchema(prop: RequiredProp, relationTargets: { clients: string; team: string }) {
  switch (prop.kind) {
    case "date":
      return { date: {} };
    case "number":
      return { number: { format: "number" } };
    case "rich_text":
      return { rich_text: {} };
    case "files":
      return { files: {} };
    case "relation": {
      const databaseId = prop.relatesTo === "clients" ? relationTargets.clients : relationTargets.team;
      // single_property = a one-way relation. A dual_property relation would
      // also write a back-reference column into the Clients/Team databases,
      // which is a change to *those* schemas that nobody asked for.
      return { relation: { database_id: databaseId, single_property: {} } };
    }
  }
}

export interface SchemaCheck {
  name: string;
  present: boolean;
  kind: PropKind;
  purpose: string;
  /** Set when the property exists but is the wrong type — we never auto-fix these. */
  typeMismatch?: string;
}

const NOTION_TYPE_FOR: Record<PropKind, string> = {
  date: "date",
  number: "number",
  rich_text: "rich_text",
  relation: "relation",
  files: "files",
};

/** Compares the live database schema against what the screen needs. */
export function checkSchema(properties: Record<string, { type: string }>): SchemaCheck[] {
  return REQUIRED_PROJECT_PROPS.map((prop) => {
    const existing = properties[prop.name];
    if (!existing) {
      return { name: prop.name, present: false, kind: prop.kind, purpose: prop.purpose };
    }
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
