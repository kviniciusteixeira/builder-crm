import { notFound, redirect } from "next/navigation";
import {
  listConversations,
  listConversationsForContact,
  getConversation,
  markConversationAsRead,
  resolveConversationId,
} from "@/lib/conversations";
import { ConversationsListLive } from "@/components/conversations/ConversationsListLive";
import { ConversationView } from "@/components/conversations/ConversationView";
import { canAccessContact, getCurrentMember, visibleOwnerId } from "@/lib/team";

// A caixa de entrada lê a base em cada request: nunca se pré-renderiza no build.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params;

  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");

  const { conversation, contact, messages } = await getConversation(conversationId);

  // Retrocompatibilidade: até a migração multicanal a rota era /conversations/<contactId>.
  // Os links e bookmarks antigos se redirecionam ao fio mais recente desse contato.
  if (!conversation) {
    const resolved = await resolveConversationId(conversationId);
    if (resolved && resolved !== conversationId) {
      redirect(`/conversations/${resolved}`);
    }
    notFound();
  }

  // Fio de um contato alheio: como se não existisse.
  const accesible = contact
    ? canAccessContact(member, contact)
    : member.role === "admin";
  if (!accesible) notFound();

  await markConversationAsRead(conversationId);

  const [conversations, contactThreads] = await Promise.all([
    listConversations({ ownerId: visibleOwnerId(member) }),
    contact ? listConversationsForContact(contact.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-2rem)] -m-4 md:-m-6 lg:-m-8 overflow-hidden border border-border rounded-lg bg-background">
      <ConversationsListLive
        initialConversations={conversations}
        selectedId={conversationId}
      />
      <ConversationView
        conversation={conversation}
        threads={contactThreads.map((t) => ({
          conversationId: t.conversationId,
          channel: t.channel,
        }))}
        contact={
          contact
            ? {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                tags: contact.tags ?? [],
                ownerId: contact.ownerId,
                notes: contact.notes,
                aiEnabled: contact.aiEnabled,
                needsHuman: contact.needsHuman,
                needsHumanReason: contact.needsHumanReason,
                customFields: contact.customFields as Record<string, unknown> | null,
                aiSummary: contact.aiSummary,
                aiSummaryAt: contact.aiSummaryAt,
              }
            : null
        }
        initialMessages={messages}
        isAdmin={member.role === "admin"}
      />
    </div>
  );
}
