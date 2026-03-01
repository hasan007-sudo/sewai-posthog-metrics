export interface PostHogEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp?: string;
}

export interface PostHogWebhookPayload {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp?: string;
}

export interface PostHogWebhookWrapper {
  event: {
    uuid: string;
    distinct_id: string;
    timestamp: string;
    event: string;
    properties: Record<string, unknown>;
    elements_chain?: string;
    url?: string;
  };
  person?: {
    id: string;
    properties: Record<string, unknown>;
    name?: string;
    url?: string;
  };
}

export interface SessionStartedProperties {
  room_name: string;
  activity_id: string;
  activity_title: string;
  question_count: number;
  student_name?: string;
}

export interface SessionEndedProperties {
  room_name: string;
  activity_id?: string;
  duration_ms?: number;
}

export interface QuestionCompletedProperties {
  room_name: string;
  activity_id: string;
  question_id: string;
  question_text?: string;
  attempt_number?: number;
}

export interface NextActivityProperties {
  from_activity_id?: string;
  to_activity_id?: string;
  to_activity_title?: string;
}

export interface HintRequestedProperties {
  room_name: string;
  activity_id: string;
  question_id?: string;
  question_text?: string;
}

export interface HintRevealedProperties {
  room_name: string;
  activity_id: string;
  question_id?: string;
  hint_text?: string;
  agent_response?: string;
  cached?: boolean;
}

export interface HintFollowedByResponseProperties {
  room_name: string;
  activity_id: string;
  question_id?: string;
  user_response?: string;
  hint_text?: string;
}
