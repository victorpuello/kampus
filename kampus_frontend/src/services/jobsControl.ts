import { api } from './api'

export type PeriodicJobSnapshot = {
  key: string
  task: string
  enabled: boolean
  enabled_override: boolean | null
  default_enabled: boolean
  editable_params: string[]
  default_params: Record<string, number>
  params_override: Record<string, number>
  effective_params: Record<string, number>
  schedule_override: {
    minute?: string
    hour?: string
    day_of_week?: string
  }
  effective_schedule: {
    minute: number | string
    hour: number | string
    day_of_week: string
  }
  scheduler_restart_required: boolean
  schedule: {
    minute: number | string
    hour: number | string
    day_of_week: string
  }
}

export type JobsOverviewReport = {
  counts_by_status: Record<string, number>
  running: number
  failed: number
}

export type JobsOverviewNotifications = {
  created_last_24h: number
  unread_total: number
}

export type JobsOverviewEmail = {
  counts_by_status: Record<string, number>
  failed: number
  suppressed: number
}

export type JobsOverviewRun = {
  id: number
  source: 'report' | 'periodic'
  report_type: string
  status: string
  created_at: string
  finished_at: string | null
  created_by: number | null
}

export type JobsRunLogEvent = {
  id: number
  created_at: string
  event_type: string
  level: string
  message: string
  meta: Record<string, unknown>
}

export type JobsRunLogsResponse = {
  run: {
    id: number
    report_type: string
    status: string
    created_at: string
    started_at: string | null
    finished_at: string | null
    error_code: string | null
    error_message: string | null
  }
  events: JobsRunLogEvent[]
}

export type JobsOverviewResponse = {
  window_hours: number
  generated_at: string
  report_jobs: JobsOverviewReport
  notifications: JobsOverviewNotifications
  email_delivery: JobsOverviewEmail
  periodic_jobs: PeriodicJobSnapshot[]
  latest_runs: JobsOverviewRun[]
}

export type RunNowResponse = {
  job_key: string
  task: string
  task_id: string
  run_id?: number
  dispatched: boolean
}

export type TogglePeriodicJobResponse = {
  job_key: string
  enabled: boolean
  enabled_override: boolean | null
  updated_at: string
}

export type UpdatePeriodicJobParamsResponse = {
  job_key: string
  params_override: Record<string, number>
  updated_at: string
}

export type UpdatePeriodicJobScheduleResponse = {
  job_key: string
  schedule_override: {
    minute: string
    hour: string
    day_of_week: string
  }
  updated_at: string
  scheduler_restart_required: boolean
}

export const jobsControlApi = {
  getOverview: () => api.get<JobsOverviewResponse>('/api/reports/operations/jobs/overview/'),

  runNow: (jobKey: string) =>
    api.post<RunNowResponse>('/api/reports/operations/jobs/run-now/', {
      job_key: jobKey,
    }),

  toggleJob: (jobKey: string, enabled: boolean) =>
    api.post<TogglePeriodicJobResponse>('/api/reports/operations/jobs/toggle/', {
      job_key: jobKey,
      enabled,
    }),

  updateParams: (jobKey: string, params: Record<string, number>) =>
    api.post<UpdatePeriodicJobParamsResponse>('/api/reports/operations/jobs/params/', {
      job_key: jobKey,
      params,
    }),

  updateSchedule: (jobKey: string, schedule: { minute: string; hour: string; day_of_week: string }) =>
    api.post<UpdatePeriodicJobScheduleResponse>('/api/reports/operations/jobs/schedule/', {
      job_key: jobKey,
      schedule,
    }),

  getRunLogs: (runId: number, source: 'report' | 'periodic' = 'report') =>
    api.get<JobsRunLogsResponse>(
      source === 'periodic'
        ? `/api/reports/operations/jobs/periodic-runs/${runId}/logs/`
        : `/api/reports/operations/jobs/runs/${runId}/logs/`,
    ),
}
