import type { QASource } from "./notebook-types.ts";

export interface NotebookTurnInput {
  conversation_id: string;
  project_id: string;
  user_id: string;
  client_request_id: string;
  question: string;
  answer: string;
  sources: QASource[];
  no_sufficient_context: boolean;
  metadata?: Record<string, unknown>;
}

export interface NotebookTurnResult {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  citation_ids: string[];
}

export class NotebookConversationAccessError extends Error {
  readonly code = "NOTEBOOK_CONVERSATION_FORBIDDEN";

  constructor() {
    super("Notebook conversation not found or unauthorized");
    this.name = "NotebookConversationAccessError";
  }
}

export function isNotebookSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  return code === "42P01"
    || code === "PGRST202"
    || code === "PGRST205"
    || /notebook_(sources|conversations|messages|citations)/i.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Notebook persistence failed";
}

function boundedTitle(question: string): string {
  const compact = question.replace(/\s+/g, " ").trim();
  return compact.slice(0, 120) || "Notebook conversation";
}

export async function resolveNotebookConversation(
  supabase: any,
  projectId: string,
  userId: string,
  conversationId: string | null,
  title: string,
): Promise<string> {
  if (conversationId) {
    const { data, error } = await supabase
      .from("notebook_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new NotebookConversationAccessError();
    return data.id as string;
  }

  const { data, error } = await supabase
    .from("notebook_conversations")
    .insert({
      project_id: projectId,
      user_id: userId,
      title: boundedTitle(title),
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Notebook conversation was not created");
  return data.id as string;
}

async function upsertMessage(
  supabase: any,
  input: {
    conversation_id: string;
    project_id: string;
    user_id: string;
    role: "user" | "assistant";
    content: string;
    client_request_id: string;
    metadata: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("notebook_messages")
    .upsert(input, { onConflict: "conversation_id,role,client_request_id" })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to persist Notebook ${input.role} message: ${errorMessage(error)}`);
  if (!data?.id) throw new Error(`Notebook ${input.role} message was not created`);
  return data.id as string;
}

async function ensureNotebookSources(
  supabase: any,
  projectId: string,
  userId: string,
  sources: QASource[],
): Promise<Map<string, string>> {
  const versionIds = [...new Set(sources.map((source) => source.versionId).filter(Boolean))];
  if (versionIds.length === 0) return new Map();

  const { data: versions, error: versionsError } = await supabase
    .from("document_versions")
    .select("id, document_id")
    .in("id", versionIds);
  if (versionsError) throw versionsError;

  const documentIds = [...new Set((versions ?? []).map((version: { document_id: string }) => version.document_id))];
  if (documentIds.length === 0) return new Map();

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .in("id", documentIds);
  if (documentsError) throw documentsError;

  const documentNames = new Map<string, string>(
    (documents ?? []).map((document: { id: string; name: string }) => [document.id, document.name]),
  );
  const rows = (versions ?? [])
    .filter((version: { id: string; document_id: string }) => documentNames.has(version.document_id))
    .map((version: { id: string; document_id: string }) => ({
      project_id: projectId,
      user_id: userId,
      source_type: "document_version",
      document_id: version.document_id,
      version_id: version.id,
      title: documentNames.get(version.document_id) ?? "Document version",
    }));

  if (rows.length === 0) return new Map();

  const { data, error } = await supabase
    .from("notebook_sources")
    .upsert(rows, { onConflict: "project_id,version_id" })
    .select("id, version_id");
  if (error) throw error;

  return new Map(
    (data ?? []).map((source: { id: string; version_id: string }) => [source.version_id, source.id]),
  );
}

async function persistCitations(
  supabase: any,
  messageId: string,
  sourceIds: Map<string, string>,
  sources: QASource[],
): Promise<string[]> {
  const { error: deleteError } = await supabase
    .from("notebook_citations")
    .delete()
    .eq("message_id", messageId);
  if (deleteError) throw deleteError;

  const rows = sources.flatMap((source, index) => {
    const sourceId = sourceIds.get(source.versionId);
    if (!sourceId) return [];
    return [{
      message_id: messageId,
      source_id: sourceId,
      chunk_id: source.chunkId || null,
      citation_index: index,
      quote: source.content.slice(0, 4000),
      page: source.page,
      chapter_number: source.chapterNumber,
      chapter_title: source.chapterTitle,
      chunk_position: source.position,
      retrieval_score: source.score,
    }];
  });

  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("notebook_citations")
    .insert(rows)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((citation: { id: string }) => citation.id);
}

/**
 * Persist one complete QA turn. All writes are service-role-side and are
 * intentionally separate from canonical Knowledge Layer persistence.
 */
export async function persistNotebookTurn(
  supabase: any,
  input: NotebookTurnInput,
): Promise<NotebookTurnResult> {
  const metadata = {
    no_sufficient_context: input.no_sufficient_context,
    source_count: input.sources.length,
    ...(input.metadata ?? {}),
  };
  const userMessageId = await upsertMessage(supabase, {
    conversation_id: input.conversation_id,
    project_id: input.project_id,
    user_id: input.user_id,
    role: "user",
    content: input.question,
    client_request_id: input.client_request_id,
    metadata: {},
  });
  const assistantMessageId = await upsertMessage(supabase, {
    conversation_id: input.conversation_id,
    project_id: input.project_id,
    user_id: input.user_id,
    role: "assistant",
    content: input.answer,
    client_request_id: input.client_request_id,
    metadata,
  });
  const sourceIds = await ensureNotebookSources(
    supabase,
    input.project_id,
    input.user_id,
    input.sources,
  );
  const citationIds = await persistCitations(
    supabase,
    assistantMessageId,
    sourceIds,
    input.sources,
  );

  await supabase
    .from("notebook_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversation_id)
    .eq("project_id", input.project_id)
    .eq("user_id", input.user_id);

  return {
    conversation_id: input.conversation_id,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    citation_ids: citationIds,
  };
}
