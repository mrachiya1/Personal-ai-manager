import { getLearningTopics, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import { NewLearningTopicButton } from "@/components/LearningForm";

const progressBadge: Record<string, string> = {
  "Not Started": "badge pending",
  "In Progress": "badge med",
  Completed: "badge low",
};

export default async function LearningPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Growth · Self-improvement</div>
          <h1 className="brand-serif">Learning</h1>
        </div>
        {(await notionConnected()) && (
          <div className="topbar-actions">
            <NewLearningTopicButton />
          </div>
        )}
      </div>
      {!(await notionConnected()) ? <ConnectPrompt /> : <LearningBody />}
      <div className="footnote">Orex OS — Learning · live data from Notion</div>
    </>
  );
}

async function LearningBody() {
  const topics = await getLearningTopics();
  return (
    <section className="grid-2" style={{ gridTemplateColumns: "1fr" }}>
      {topics.length === 0 && <div className="card section-card">No topics yet — add one in Notion.</div>}
      {topics.map((topic) => (
        <div className="card section-card" key={topic.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2>{topic.topic}</h2>
            <span className={progressBadge[topic.progress]}>{topic.progress}</span>
          </div>
          {topic.description && <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{topic.description}</p>}
          {topic.resources && (
            <div className="section-sub" style={{ marginBottom: 4 }}>
              Resources: {topic.resources}
            </div>
          )}
          {topic.sessionNotes && (
            <div className="section-sub" style={{ marginBottom: 0 }}>
              Last session: {topic.sessionNotes}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
