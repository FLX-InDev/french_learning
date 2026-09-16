import { getAllDialogues } from "@/lib/parser";
import { ClientDialogues } from "@/components/dialogues/ClientDialogues";
import { PageHeader } from "@/components/PageHeader";

export default function DialoguesPage() {
  const dialogues = getAllDialogues();

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="page.dialogues.title"
        descKey="page.dialogues.subtitle"
      />
      <ClientDialogues dialogues={dialogues} />
    </div>
  );
}
