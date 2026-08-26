import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isMainScope,
  normalizeBranchId,
  normalizeUnifiedRetrievalScope,
  resolveEffectiveScope,
} from "./retrieval-scope.ts";

Deno.test("normalizeBranchId collapses null, undefined, and empty string to null", () => {
  assertEquals(normalizeBranchId(null), null);
  assertEquals(normalizeBranchId(undefined), null);
  assertEquals(normalizeBranchId(""), null);
});

Deno.test("normalizeBranchId preserves a real branch id", () => {
  assertEquals(normalizeBranchId("branch-123"), "branch-123");
});

Deno.test("isMainScope is true for falsy branch ids", () => {
  assertEquals(isMainScope(null), true);
  assertEquals(isMainScope(undefined), true);
  assertEquals(isMainScope(""), true);
});

Deno.test("isMainScope is false for a real branch id", () => {
  assertEquals(isMainScope("branch-123"), false);
});

Deno.test("resolveEffectiveScope for Main (no branch) includes only Main", () => {
  const scope = resolveEffectiveScope(null);
  assertEquals(scope, {
    branchId: null,
    isMain: true,
    includeMain: true,
    includeBranch: false,
  });
});

Deno.test("resolveEffectiveScope for undefined branch id behaves like Main", () => {
  const scope = resolveEffectiveScope(undefined);
  assertEquals(scope.isMain, true);
  assertEquals(scope.includeBranch, false);
});

Deno.test("resolveEffectiveScope for a Branch includes Main as base and Branch as overlay", () => {
  const scope = resolveEffectiveScope("branch-123");
  assertEquals(scope, {
    branchId: "branch-123",
    isMain: false,
    includeMain: true,
    includeBranch: true,
  });
});

Deno.test("normalizeUnifiedRetrievalScope defaults to Main-only, no pending, adjacent on", () => {
  const scope = normalizeUnifiedRetrievalScope({ projectId: "project-1" });
  assertEquals(scope, {
    projectId: "project-1",
    branchId: null,
    isMain: true,
    includeMain: true,
    includeBranch: false,
    sourceVersionIds: [],
    chapterNumbers: [],
    chunkIds: [],
    includeAdjacent: true,
    includePendingBranchData: false,
  });
});

Deno.test("normalizeUnifiedRetrievalScope never infers a branch when none is passed", () => {
  const scope = normalizeUnifiedRetrievalScope({ projectId: "project-1", branchId: undefined });
  assertEquals(scope.branchId, null);
  assertEquals(scope.isMain, true);
});

Deno.test("normalizeUnifiedRetrievalScope resolves an explicit branch and sanitizes document filters", () => {
  const scope = normalizeUnifiedRetrievalScope({
    projectId: "project-1",
    branchId: "branch-123",
    sourceVersionIds: ["v1", "v1", "  v2  ", 42, ""],
    chapterNumbers: [1, 2, 2, -1, 1.5, "3"],
    chunkIds: ["c1", "c2"],
    includeAdjacent: false,
    includePendingBranchData: true,
  });
  assertEquals(scope, {
    projectId: "project-1",
    branchId: "branch-123",
    isMain: false,
    includeMain: true,
    includeBranch: true,
    sourceVersionIds: ["v1", "v2"],
    chapterNumbers: [1, 2],
    chunkIds: ["c1", "c2"],
    includeAdjacent: false,
    includePendingBranchData: true,
  });
});

Deno.test("normalizeUnifiedRetrievalScope ignores non-array/non-boolean scope inputs", () => {
  const scope = normalizeUnifiedRetrievalScope({
    projectId: "project-1",
    sourceVersionIds: "not-an-array",
    chapterNumbers: null,
    chunkIds: undefined,
    includeAdjacent: "yes",
    includePendingBranchData: "yes",
  });
  assertEquals(scope.sourceVersionIds, []);
  assertEquals(scope.chapterNumbers, []);
  assertEquals(scope.chunkIds, []);
  assertEquals(scope.includeAdjacent, true);
  assertEquals(scope.includePendingBranchData, false);
});
