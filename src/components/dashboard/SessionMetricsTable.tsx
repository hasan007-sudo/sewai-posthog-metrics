"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionCompletionBandChart } from "@/components/dashboard/QuestionCompletionBandChart";
import {
  COMPLETION_BAND_ORDER,
  getCompletionBandLabel,
  type CompletionBand,
  type CompletionBandLabel,
} from "@/lib/completion-bands";
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
  started_at: string;
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
  completionBands: CompletionBand[];
}

interface SessionMetricsTableProps {
  selectedOrg: string | null;
}

const FIXED_ORG_OPTIONS = ["FSSA", "DET", "demo"] as const;

const CSV_COLUMNS: (keyof SessionMetricsRow)[] = [
  "status",
  "total_questions_of_session",
  "duration_of_session_ms",
  "started_at",
  "topic_name",
  "activity_name",
  "hint_count",
  "translated_clicks_events",
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

function toDateOnly(value: string): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function formatDateForDisplay(value: string): string {
  return value.replaceAll("-", "/");
}

function buildPosthogUrl(roomName: string): string {
  const query = {
    kind: "DataTableNode",
    columns: [
      "*",
      "event",
      "person_display_name -- Person",
      "coalesce(properties.$current_url, properties.$screen_name) -- Url / Screen",
      "properties.$lib",
      "timestamp",
    ],
    hiddenColumns: [],
    pinnedColumns: [],
    source: {
      kind: "EventsQuery",
      select: [
        "*",
        "event",
        "person_display_name -- Person",
        "coalesce(properties.$current_url, properties.$screen_name) -- Url / Screen",
        "properties.$lib",
        "timestamp",
        "properties.question_count",
        "properties.total_count",
      ],
      orderBy: ["properties.question_count\n DESC"],
      after: "-7d",
      event: "",
      properties: [
        {
          key: "room_name",
          value: [roomName],
          operator: "exact",
          type: "event",
        },
      ],
    },
    context: { type: "team_columns" },
    allowSorting: true,
    embedded: false,
    expandable: true,
    full: true,
    propertiesViaUrl: true,
    showActions: true,
    showColumnConfigurator: true,
    showCount: false,
    showDateRange: true,
    showElapsedTime: false,
    showEventFilter: true,
    showEventsFilter: false,
    showExport: true,
    showHogQLEditor: true,
    showOpenEditorButton: true,
    showPersistentColumnConfigurator: true,
    showPropertyFilter: true,
    showRecordingColumn: false,
    showReload: true,
    showResultsTable: true,
    showSavedFilters: false,
    showSavedQueries: true,
    showSearch: true,
    showSourceQueryOptions: true,
    showTableViews: false,
    showTestAccountFilters: true,
    showTimings: false,
  };

  return `https://us.posthog.com/project/264307/activity/explore#q=${encodeURIComponent(
    JSON.stringify(query),
  )}`;
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
            <TableHead className="sticky top-0 z-20 bg-background">
              Student Email
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Activity
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Topic
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Duration
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Questions Completed
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Total Questions
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Hint Count
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Translated Clicks
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Status
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              Session ID
            </TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">
              PostHog URL
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: LOADING_ROWS }, (_, index) => (
            <TableRow key={`session-skeleton-${index}`}>
              <TableCell>
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-10 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-10 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-14 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-80 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SessionMetricsTable({ selectedOrg }: SessionMetricsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isTransitionPending, startTransition] = useTransition();
  const [rows, setRows] = useState<SessionMetricsRow[]>([]);
  const [completionBands, setCompletionBands] = useState<CompletionBand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState(selectedOrg ?? "all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [completionBandFilter, setCompletionBandFilter] = useState<
    CompletionBandLabel | "all"
  >("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    setCompletionBands([]);
    try {
      const query = new URLSearchParams();
      if (orgFilter !== "all") {
        query.set("org", orgFilter);
      }

      const endpoint = query.size
        ? `/api/sessions/metrics?${query.toString()}`
        : "/api/sessions/metrics";
      const response = await fetch(endpoint, { cache: "no-store", signal });

      if (!response.ok) {
        throw new Error("Failed to load session metrics");
      }

      const data = (await response.json()) as SessionMetricsResponse;
      setRows(data.rows ?? []);
      setCompletionBands(data.completionBands ?? []);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Failed to load session metrics.");
        setRows([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [orgFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  useEffect(() => {
    setOrgFilter(selectedOrg ?? "all");
  }, [selectedOrg]);

  const dateBounds = useMemo(() => {
    const validDates = rows
      .map((row) => toDateOnly(row.started_at))
      .filter((date): date is string => date !== null);

    if (validDates.length === 0) {
      return { min: "", max: "" };
    }

    return {
      min: validDates.reduce((acc, value) => (value < acc ? value : acc)),
      max: validDates.reduce((acc, value) => (value > acc ? value : acc)),
    };
  }, [rows]);

  useEffect(() => {
    if (!dateBounds.min || !dateBounds.max) {
      return;
    }

    setStartDateFilter((current) => current || dateBounds.min);
    setEndDateFilter((current) => current || dateBounds.max);
  }, [dateBounds.max, dateBounds.min]);

  const isOrgControlDisabled = isLoading || isTransitionPending;

  const studentOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.student_email))).sort();
  }, [rows]);

  const activityOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.activity_name))).sort();
  }, [rows]);

  const topicOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.topic_name))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const startAt = startDateFilter
      ? new Date(`${startDateFilter}T00:00:00`).getTime()
      : null;
    const endAt = endDateFilter
      ? new Date(`${endDateFilter}T23:59:59.999`).getTime()
      : null;

    return rows.filter((row) => {
      const normalizedOrg = row.org_name.trim().toLowerCase();
      if (orgFilter !== "all" && normalizedOrg !== orgFilter.toLowerCase()) {
        return false;
      }
      if (studentFilter !== "all" && row.student_email !== studentFilter) {
        return false;
      }
      if (activityFilter !== "all" && row.activity_name !== activityFilter) {
        return false;
      }
      if (topicFilter !== "all" && row.topic_name !== topicFilter) {
        return false;
      }
      if (
        completionBandFilter !== "all" &&
        getCompletionBandLabel(
          row.questions_completed,
          row.total_questions_of_session,
        ) !== completionBandFilter
      ) {
        return false;
      }

      const startedAt = Date.parse(row.started_at);
      if (!Number.isNaN(startedAt)) {
        if (startAt !== null && startedAt < startAt) {
          return false;
        }
        if (endAt !== null && startedAt > endAt) {
          return false;
        }
      } else if (startAt !== null || endAt !== null) {
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
  }, [
    rows,
    search,
    orgFilter,
    studentFilter,
    activityFilter,
    topicFilter,
    completionBandFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const dateRangeLabel =
    startDateFilter && endDateFilter
      ? `${formatDateForDisplay(startDateFilter)} - ${formatDateForDisplay(endDateFilter)}`
      : "All dates";

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border bg-muted/30 p-4 space-y-6 lg:sticky lg:top-4">
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isLoading}
            onClick={() => void fetchData()}
          >
            <RotateCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <Filter className="h-5 w-5" />
            Filters
          </h3>

          <div className="space-y-2">
            <label htmlFor="org-filter" className="text-sm font-medium">
              Organization
            </label>
            <select
              id="org-filter"
              value={orgFilter}
              onChange={(event) => {
                const nextValue = event.target.value;
                setOrgFilter(nextValue);

                const nextParams = new URLSearchParams(searchParams.toString());
                if (nextValue === "all") {
                  nextParams.delete("org");
                } else {
                  nextParams.set("org", nextValue);
                }

                const nextQuery = nextParams.toString();
                const nextUrl =
                  nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname;

                startTransition(() => {
                  router.replace(nextUrl, { scroll: false });
                });
              }}
              disabled={isOrgControlDisabled}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {FIXED_ORG_OPTIONS.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Date Range</label>
            <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
              {dateRangeLabel}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDateFilter}
                min={dateBounds.min || undefined}
                max={endDateFilter || dateBounds.max || undefined}
                onChange={(event) => setStartDateFilter(event.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border bg-background px-2 py-2 text-sm"
              />
              <input
                type="date"
                value={endDateFilter}
                min={startDateFilter || dateBounds.min || undefined}
                max={dateBounds.max || undefined}
                onChange={(event) => setEndDateFilter(event.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border bg-background px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="student-filter" className="text-sm font-medium">
              Student
            </label>
            <select
              id="student-filter"
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
              disabled={isLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {studentOptions.map((student) => (
                <option key={student} value={student}>
                  {student}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="activity-filter" className="text-sm font-medium">
              Activity
            </label>
            <select
              id="activity-filter"
              value={activityFilter}
              onChange={(event) => setActivityFilter(event.target.value)}
              disabled={isLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {activityOptions.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="topic-filter" className="text-sm font-medium">
              Topic
            </label>
            <select
              id="topic-filter"
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              disabled={isLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="completion-band-filter" className="text-sm font-medium">
              Completion Band
            </label>
            <select
              id="completion-band-filter"
              value={completionBandFilter}
              onChange={(event) =>
                setCompletionBandFilter(
                  event.target.value as CompletionBandLabel | "all",
                )
              }
              disabled={isLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {COMPLETION_BAND_ORDER.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={() => {
              const nextParams = new URLSearchParams(searchParams.toString());
              nextParams.delete("org");
              const nextQuery = nextParams.toString();
              const nextUrl =
                nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname;

              setSearch("");
              setOrgFilter("all");
              setStudentFilter("all");
              setActivityFilter("all");
              setTopicFilter("all");
              setCompletionBandFilter("all");
              setStartDateFilter(dateBounds.min);
              setEndDateFilter(dateBounds.max);

              startTransition(() => {
                router.replace(nextUrl, { scroll: false });
              });
            }}
          >
            Clear filters
          </Button>
        </div>
      </aside>

      <div className="space-y-4">
        <QuestionCompletionBandChart
          bands={completionBands}
          isLoading={isLoading}
          selectedBand={completionBandFilter}
          onBandClick={(band) => setCompletionBandFilter(band)}
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="text"
            placeholder="Search email, session ID, topic, org..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={isLoading}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm lg:max-w-md"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={isLoading || filteredRows.length === 0}
              onClick={() => downloadRowsAsCsv(filteredRows)}
            >
              Download filtered ({filteredRows.length})
            </Button>
            <Button
              disabled={isLoading || rows.length === 0}
              onClick={() => downloadRowsAsCsv(rows)}
            >
              Download all ({rows.length})
            </Button>
          </div>
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
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Student Email
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Activity
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Topic
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Duration
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Questions Completed
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Total Questions
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Hint Count
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Translated Clicks
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Status
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    Session ID
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    PostHog URL
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, index) => (
                  <TableRow
                    key={`${row.student_session_id}-${row.started_at}-${index}`}
                    className="cursor-pointer hover:bg-muted/40"
                    tabIndex={0}
                    onClick={() => {
                      router.push(
                        `/monologue-v2/sessions/${encodeURIComponent(
                          row.student_session_id,
                        )}`,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(
                          `/monologue-v2/sessions/${encodeURIComponent(
                            row.student_session_id,
                          )}`,
                        );
                      }
                    }}
                  >
                    <TableCell>{row.student_email}</TableCell>
                    <TableCell>{row.activity_name}</TableCell>
                    <TableCell>{row.topic_name}</TableCell>
                    <TableCell>
                      {formatDuration(row.duration_of_session_ms)}
                    </TableCell>
                    <TableCell>{row.questions_completed}</TableCell>
                    <TableCell>
                      {formatTotalQuestions(row.total_questions_of_session)}
                    </TableCell>
                    <TableCell>{row.hint_count}</TableCell>
                    <TableCell>{row.translated_clicks_events}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.student_session_id}
                    </TableCell>
                    <TableCell>
                      <a
                        href={buildPosthogUrl(row.student_session_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        Open
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
