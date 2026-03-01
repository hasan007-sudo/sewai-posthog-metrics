"use client";

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

export function StudentTable({ students }: { students: StudentRow[] }) {
  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No students found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Questions</TableHead>
          <TableHead className="text-right">Avg/Session</TableHead>
          <TableHead className="text-right">Hints</TableHead>
          <TableHead className="text-right">Last Active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id}>
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
  );
}
