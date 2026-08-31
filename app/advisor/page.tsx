import AdvisorChat from "@/components/AdvisorChat";

// Server component wrapper — Next.js needs a server component at the page level
// so the client AdvisorChat can be dynamically imported cleanly.
export default function AdvisorPage() {
  return <AdvisorChat />;
}
