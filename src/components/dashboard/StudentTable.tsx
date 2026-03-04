"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface StudentRow {
  id: string;
  email: string;
  name: string | null;
  sessionCount: number;
  totalQuestionsCompleted: number;
  avgQuestionsPerSession: number;
  lastActiveDate: string;
  hintUsageCount: number;
}

const LOADING_ROWS = 8;

function StudentTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>S.No</TableHead>
            <TableHead>Student</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="text-right">Questions</TableHead>
            <TableHead className="text-right">Avg/Session</TableHead>
            <TableHead className="text-right">Hints</TableHead>
            <TableHead className="text-right">Last Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: LOADING_ROWS }, (_, index) => (
            <TableRow key={`student-skeleton-${index}`}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
              </TableCell>
              <TableCell>
                <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function StudentTable() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStudents() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/students", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load students");
        }

        const data = (await response.json()) as StudentRow[];
        setStudents(data ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Failed to load students.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    void fetchStudents();

    return () => {
      controller.abort();
    };
  }, []);

  if (isLoading) {
    return <StudentTableSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No students found.
      </div>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border">
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-20 bg-background">S.No</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background">Student</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background text-right">Sessions</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background text-right">Questions</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background text-right">Avg/Session</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background text-right">Hints</TableHead>
            <TableHead className="sticky top-0 z-20 bg-background text-right">Last Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow key={student.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Link
                  href={`/monologue-v2/students/${student.id}`}
                  className="hover:underline font-medium"
                >
                  {student.name || student.email}
                </Link>
                {student.name && (
                  <div className="text-xs text-muted-foreground">
                    {student.email}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{student.sessionCount}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {student.totalQuestionsCompleted}
              </TableCell>
              <TableCell className="text-right">
                {student.avgQuestionsPerSession}
              </TableCell>
              <TableCell className="text-right">
                {student.hintUsageCount}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(student.lastActiveDate), {
                  addSuffix: true,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
