export interface QASource {
  chunkId: string;
  content: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  page: number | null;
  position: number;
  versionId: string;
  score: number;
  documentName?: string;
}
