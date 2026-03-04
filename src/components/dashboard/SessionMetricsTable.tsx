"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SessionMetricsRow {
  status: string;
  translated_clicks_events: number;
  total_questions_of_session: number;
  duration_of_session_ms: number | null;
  topic_name: string;
  activity_name: string;
  hint_count: number;
  questions_completed: number;
  student_email: string;
  student_name: string;
  student_session_id: string;
  org_name: string;
}

interface SessionMetricsResponse {
  totalSessions: number;
  rows: SessionMetricsRow[];
}

const CSV_COLUMNS: (keyof SessionMetricsRow)[] = [
  "status",
  "translated_clicks_events",
  "total_questions_of_session",
  "duration_of_session_ms",
  "topic_name",
  "activity_name",
  "hint_count",
  "questions_completed",
  "student_email",
  "student_name",
  "student_session_id",
  "org_name",
];
const LOADING_ROWS = 10;

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatTotalQuestions(value: number): string | number {
  return value === 0 ? "-" : value;
}

function csvEscape(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function downloadRowsAsCsv(rows: SessionMetricsRow[]) {
  const header = ["serial_no", ...CSV_COLUMNS].join(",");
  const body = rows.map((row, index) =>
    [
      csvEscape(index + 1),
      ...CSV_COLUMNS.map((column) => {
        if (column === "total_questions_of_session") {
          return csvEscape(
            formatTotalQuestions(row.total_questions_of_session),
          );
        }
        return csvEscape(row[column] as string | number | null);
      }),
    ].join(","),
  );
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `session-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SessionMetricsTableSkeleton() {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border">
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-20 bg-background">S.No</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Translated Clicks</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Total Questions of Session</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Duration</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Topic Name</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Activity Name</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Hint Count</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Questions Completed</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Student Email</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Student Name</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background pr-8">Student Session ID</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background pl-8 min-w-28">Org Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: LOADING_ROWS }, (_, index) => (
            <TableRow key={`session-skeleton-${index}`}>
              <TableCell>{index + 1}</TableCell>
              <TableCell><div className="h-4 w-14 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-8 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-10 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-12 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-28 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-32 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-10 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-12 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-56 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell><div className="h-4 w-48 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell className="pr-8"><div className="h-4 w-80 animate-pulse rounded bg-muted" /></TableCell>
              <TableCell className="pl-8"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SessionMetricsTable() {
  const [rows, setRows] = useState<SessionMetricsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/sessions/metrics", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load session metrics");
        }

        const data = (await response.json()) as SessionMetricsResponse;
        setRows(data.rows ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Failed to load session metrics.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    void fetchData();

    return () => {
      controller.abort();
    };
  }, []);

  const orgOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.org_name))).sort();
  }, [rows]);

  const topicOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.topic_name))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (orgFilter !== "all" && row.org_name !== orgFilter) {
        return false;
      }
      if (topicFilter !== "all" && row.topic_name !== topicFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (
        row.student_email.toLowerCase().includes(query) ||
        row.student_session_id.toLowerCase().includes(query) ||
        row.topic_name.toLowerCase().includes(query) ||
        row.activity_name.toLowerCase().includes(query) ||
        row.org_name.toLowerCase().includes(query)
      );
    });
  }, [rows, search, orgFilter, topicFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="text"
          placeholder="Search email, session ID, topic, org..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={isLoading}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm lg:max-w-md"
        />

        <select
          value={orgFilter}
          onChange={(event) => setOrgFilter(event.target.value)}
          disabled={isLoading}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All orgs</option>
          {orgOptions.map((org) => (
            <option key={org} value={org}>
              {org}
            </option>
          ))}
        </select>

        <select
          value={topicFilter}
          onChange={(event) => setTopicFilter(event.target.value)}
          disabled={isLoading}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All topics</option>
          {topicOptions.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          disabled={isLoading}
          onClick={() => {
            setSearch("");
            setOrgFilter("all");
            setTopicFilter("all");
          }}
        >
          Clear filters
        </Button>

        <Button
          disabled={isLoading || filteredRows.length === 0}
          onClick={() => downloadRowsAsCsv(filteredRows)}
        >
          Download CSV ({filteredRows.length})
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {isLoading
          ? "Loading session metrics..."
          : `Showing ${filteredRows.length} of ${rows.length} sessions`}
      </p>

      {isLoading ? (
        <SessionMetricsTableSkeleton />
      ) : error ? (
        <div className="rounded-md border border-destructive/40 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No sessions match the selected filters.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-md border">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-20 bg-background">S.No</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Translated Clicks</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Total Questions of Session</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Duration</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Topic Name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Activity Name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Hint Count</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Questions Completed</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Student Email</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Student Name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background pr-8">Student Session ID</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background pl-8 min-w-28">Org Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, index) => (
                <TableRow key={row.student_session_id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.translated_clicks_events}</TableCell>
                  <TableCell>
                    {formatTotalQuestions(row.total_questions_of_session)}
                  </TableCell>
                  <TableCell>{formatDuration(row.duration_of_session_ms)}</TableCell>
                  <TableCell>{row.topic_name}</TableCell>
                  <TableCell>{row.activity_name}</TableCell>
                  <TableCell>{row.hint_count}</TableCell>
                  <TableCell>{row.questions_completed}</TableCell>
                  <TableCell>{row.student_email}</TableCell>
                  <TableCell>{row.student_name}</TableCell>
                  <TableCell className="font-mono text-xs pr-8">
                    {row.student_session_id}
                  </TableCell>
                  <TableCell className="pl-8 font-medium">{row.org_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
