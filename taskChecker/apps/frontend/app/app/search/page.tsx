"use client";

import { Suspense, useState, useCallback, useMemo, memo, useEffect, startTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useTenant } from "@/components/store";
import { IconSearch, IconFile, IconMessageSquare, IconFilter, IconChevronRight, IconClock, IconArrowLeft } from "@/components/icons";
import { api, getCurrentTenantId, type SearchResult } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo, hueFrom } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const RESULT_TYPES = [
  { value: "all", label: "All", icon: IconSearch },
  { value: "task", label: "Tasks", icon: IconFile },
  { value: "comment", label: "Comments", icon: IconMessageSquare },
] as const;

const SearchResultItem = memo(function SearchResultItem({
  result,
  query,
}: {
  result: SearchResult;
  query: string;
}) {
  const highlight = (text: string) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i}>{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  if (result.type === "task") {
    return (
      <Link href={`/app/tasks/${result.id}`} className="search-result task-result">
        <div className="result-header">
          <span className="result-type task">Task</span>
          <span className="result-id">{result.id?.slice(0, 8)}</span>
        </div>
        <h4 className="result-title">{highlight(result.title ?? "")}</h4>
        <div className="result-meta">
          {result.status && <span className="result-status">{result.status}</span>}
          {result.projectId && <span className="result-project">{result.projectId.slice(0, 8)}</span>}
          <span className="result-score">Score: {result.score?.toFixed(2)}</span>
        </div>
        {result.snippet && <p className="result-snippet">{highlight(result.snippet)}</p>}
      </Link>
    );
  }

  return (
    <Link href={`/app/tasks/${result.taskId}`} className="search-result comment-result">
      <div className="result-header">
        <span className="result-type comment">Comment</span>
        <span className="result-id">{result.id?.slice(0, 8)}</span>
      </div>
      <p className="result-comment-body">{highlight(result.snippet ?? "")}</p>
      <div className="result-meta">
        {result.taskId && <span className="result-task">Task: {result.taskId.slice(0, 8)}</span>}
        {result.authorId && <span className="result-author">By: {result.authorId.slice(0, 8)}</span>}
        <span className="result-score">Score: {result.score?.toFixed(2)}</span>
      </div>
    </Link>
  );
});

function SearchPageContent() {
  const { org } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = getCurrentTenantId();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [type, setType] = useState((searchParams.get("type") as "all" | "task" | "comment") ?? "all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null }> }>(
    orgId ? `search-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const nameById = useMemo(
    () => new Map((membersQ.data?.members ?? []).map((m) => [m.userId, m.name ?? null])),
    [membersQ.data]
  );

  const performSearch = useCallback(async () => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    if (!orgId) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.search.query(query, type, 50);
      setResults(res.results);
      // Update URL without navigation
      const params = new URLSearchParams();
      params.set("q", query);
      if (type !== "all") params.set("type", type);
      router.replace(`/app/search?${params.toString()}`, { scroll: false });
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, type, orgId, router]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      void performSearch();
    }, 200);
    return () => clearTimeout(timer);
  }, [performSearch]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => setQuery(e.target.value));
  };

  const handleTypeChange = (value: "all" | "task" | "comment") => {
    startTransition(() => setType(value));
  };

  return (
    <AppShell>
      <div className="page search-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Search</h1>
            <p className="page-subtitle">Find tasks, comments, and more in {org?.name ?? "your organization"}</p>
          </div>
        </header>

        <div className="search-container">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void performSearch();
            }}
          >
            <Field orientation="horizontal">
              <Input
                type="search"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search tasks, comments… (minimum 2 characters)"
                autoFocus
                aria-label="Search tasks and comments"
              />
              <Button type="submit" disabled={loading}>
                <IconSearch size={14} /> Search
              </Button>
            </Field>
          </form>

          <div className="search-filters" role="group" aria-label="Result type">
            {RESULT_TYPES.map((t) => (
              <button
                key={t.value}
                className={cx("filter-btn", type === t.value && "active")}
                onClick={() => handleTypeChange(t.value as "all" | "task" | "comment")}
              >
                <t.icon size={14} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="search-results">
            {loading ? (
              <div className="loading">Searching…</div>
            ) : hasSearched ? (
              results.length === 0 ? (
                <div className="empty-state">
                  <IconSearch size={48} className="dim" />
                  <h3>No results found</h3>
                  <p>Try a different search term or filter</p>
                </div>
              ) : (
                <div className="results-list">
                  <p className="results-count">{results.length} result{results.length !== 1 ? "s" : ""} for "{query}"</p>
                  {results.map((result) => (
                    <SearchResultItem key={result.id} result={result} query={query} />
                  ))}
                </div>
              )
            ) : (
              <div className="search-hints">
                <h3>Search tips</h3>
                <ul>
                  <li>Use quotes for exact phrases: <code>"design review"</code></li>
                  <li>Prefix with <code>title:</code> to search only titles</li>
                  <li>Prefix with <code>body:</code> to search only descriptions</li>
                  <li>Use <code>status:done</code> to filter by status</li>
                  <li>Combine terms: <code>bug status:todo</code></li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}