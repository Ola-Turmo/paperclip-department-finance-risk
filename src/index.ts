import department from "./data/department.json";
import roles from "./data/roles.json";
import jobs from "./data/jobs.json";
import skills from "./data/skills.json";
import connectors from "./data/connectors.json";

export { department, roles, jobs, skills, connectors };

// Export types and services for finance-risk workflows
export * from "./types.js";
export { ApprovalService } from "./approval-service.js";
export { VarianceAnomalyService } from "./variance-anomaly-service.js";
