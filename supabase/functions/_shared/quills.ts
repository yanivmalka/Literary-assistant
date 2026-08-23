// Server-side Quill metering helpers.
// One Quill represents 5,000 Gemini tokens.

export interface GeminiUsageMetadata {
  totalTokenCount?: unknown;
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
  thoughtsTokenCount?: unknown;
  cachedContentTokenCount?: unknown;
}

function getTotalTokens(usage: GeminiUsageMetadata | null | undefined): number {
  const total = Number(usage?.totalTokenCount ?? 0);
  return Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
}

export async function assertQuillsAvailable(
  supabase: any,
  userId: string,
): Promise<{ available: boolean; balance: number }> {
  const { data, error } = await supabase
    .from('user_quill_wallets')
    .select('quills_balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check Quill balance: ${error.message}`);
  }

  const balance = Number(data?.quills_balance ?? 0);
  return { available: balance > 0, balance };
}

export async function consumeGeminiUsage(
  supabase: any,
  userId: string,
  usage: GeminiUsageMetadata,
  source: string,
  metadata: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ balance: number; remainder: number; chargedQuills: number; totalTokens: number }> {
  const totalTokens = getTotalTokens(usage);

  const { data, error } = await supabase.rpc('consume_gemini_tokens', {
    p_user_id: userId,
    p_total_tokens: totalTokens,
    p_source: source,
    p_metadata: metadata,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    throw new Error('Quill consumption returned an empty result');
  }

  return {
    balance: Number(result.quills_balance ?? 0),
    remainder: Number(result.token_remainder ?? 0),
    chargedQuills: Number(result.charged_quills ?? 0),
    totalTokens: Number(result.total_tokens ?? totalTokens),
  };
}
