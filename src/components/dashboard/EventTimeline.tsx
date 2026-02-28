"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuestionProgress {
  id: string;
  questionId: string;
  questionText: string | null;
  completedAt: string;
  attemptNumber: number;
}

interface HintUsage {
  id: string;
  questionId: string | null;
  questionText: string | null;
  hintText: string | null;
  agentResponse: string | null;
  userResponse: string | null;
  cached: boolean;
  requestedAt: string;
  revealedAt: string | null;
  respondedAt: string | null;
}

interface RawEvent {
  id: string;
  eventType: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

export function QuestionTimeline({ questions }: { questions: QuestionProgress[] }) {
  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No questions completed.</p>;
  }

  return (
    <div className="space-y-2">
      {questions.map((q, idx) => (
        <div key={q.id} className="flex items-start gap-3 py-2 border-b last:border-0">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {q.questionText || q.questionId}
            </p>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              <span>{format(new Date(q.completedAt), "HH:mm:ss")}</span>
              {q.attemptNumber > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  Attempt {q.attemptNumber}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HintTimeline({ hints }: { hints: HintUsage[] }) {
  if (hints.length === 0) {
    return <p className="text-sm text-muted-foreground">No hints used.</p>;
  }

  return (
    <div className="space-y-4">
      {hints.map((hint) => (
        <Card key={hint.id} className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {hint.questionText || hint.questionId || "Hint"}
              </CardTitle>
              <div className="flex items-center gap-2">
                {hint.cached && (
                  <Badge variant="outline" className="text-[10px]">Cached</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(hint.requestedAt), "HH:mm:ss")}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {hint.agentResponse && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Agent Response</p>
                <p className="text-sm bg-muted p-2 rounded">{hint.agentResponse}</p>
              </div>
            )}
            {hint.hintText && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Hint Text</p>
                <p className="text-sm bg-yellow-50 dark:bg-yellow-950 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                  {hint.hintText}
                </p>
              </div>
            )}
            {hint.userResponse && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Student Response</p>
                <p className="text-sm bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
                  {hint.userResponse}
                </p>
              </div>
            )}
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              {hint.revealedAt && (
                <span>Revealed: {format(new Date(hint.revealedAt), "HH:mm:ss")}</span>
              )}
              {hint.respondedAt && (
                <span>Response: {format(new Date(hint.respondedAt), "HH:mm:ss")}</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RawEventTimeline({ events }: { events: RawEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events recorded.</p>;
  }

  const eventColors: Record<string, string> = {
    monologue_session_started: "bg-green-500",
    monologue_session_end_clicked: "bg-red-500",
    monologue_question_completed: "bg-blue-500",
    next_activity_clicked: "bg-purple-500",
    hint_requested: "bg-yellow-500",
    hint_revealed: "bg-yellow-600",
    hint_followed_by_response: "bg-orange-500",
  };

  return (
    <div className="space-y-1">
      {events.map((event) => (
        <div key={event.id} className="flex items-center gap-3 py-1.5 text-sm">
          <span className="text-xs text-muted-foreground font-mono w-16">
            {format(new Date(event.timestamp), "HH:mm:ss")}
          </span>
          <div
            className={`w-2 h-2 rounded-full ${eventColors[event.eventType] || "bg-gray-400"}`}
          />
          <span className="font-mono text-xs">{event.eventType}</span>
        </div>
      ))}
    </div>
  );
}
