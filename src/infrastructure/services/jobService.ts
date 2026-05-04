export { jobsRepository as jobService } from "@/src/infrastructure/repositories/jobs.repository"
export type {
  CreateJobInput,
  UpdateJobInput,
  CreateJobPartInput,
  CreateJobAssigneeInput,
  CreateJobRollAllocationInput,
  JobMaterialSufficiency,
} from "@/src/infrastructure/repositories/jobs.repository"

export { uploadJobPdf, JOB_PDF_SHARE_TTL_SECONDS } from "./jobPdfShareService"
export type { JobPdfShareResult } from "./jobPdfShareService"
