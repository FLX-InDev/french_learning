import { getAllDialogues } from "@/lib/parser";
import { DialoguePlayer } from "@/components/dialogues/DialoguePlayer";
import { ClientDialogues } from "@/components/dialogues/ClientDialogues";

export default function DialoguesPage() {
  const dialogues = getAllDialogues();
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">💬 日常对话</h1>
        <p className="text-sm text-gray-400 mt-1">双角色朗读 · 点🎭你来演跟读</p>
      </header>
      <ClientDialogues dialogues={dialogues} />
    </div>
  );
}