import { readFile } from "node:fs/promises";

const PROJECT_OWNER = process.env.PROJECT_OWNER;
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || "1");
const STATUS_FIELD_NAME = "Status";
const SPRINT_FIELD_NAME = "Sprint";
const TARGET_DATE_FIELD_NAME = "Target date";
const ACTIVE_SPRINT_STATUSES = new Set(["Backlog", "Todo", "In Progress", "Blocked", "In Review"]);
const CLOSED_STATUS_NAMES = new Set(["Done", "Canceled"]);
const CLOSING_REFERENCE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#\d+\b/i;
const DRY_RUN = process.env.DRY_RUN === "true";

const token = process.env.PROJECT_TOKEN || process.env.GITHUB_TOKEN;
const [repoOwner, repoName] = (process.env.GITHUB_REPOSITORY || "").split("/");

if (!token) {
  throw new Error("Missing PROJECT_TOKEN or GITHUB_TOKEN.");
}

if (!PROJECT_OWNER || !repoOwner || !repoName) {
  throw new Error("Missing repository or project owner context.");
}

const payload = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))
  : {};

const eventName = process.env.GITHUB_EVENT_NAME || "";
const eventAction = payload.action || "";
const normalizeStateReason = (value) => (value ? String(value).toLowerCase() : null);

const formatDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const graphql = async (query, variables = {}) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "rema-project-board-sync",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    const message = body.errors.map((error) => error.message).join("; ");
    throw new Error(message);
  }

  return body.data;
};

const rest = async (path, { method = "GET", body } = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "rema-project-board-sync",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub REST request failed with ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const getProjectContext = async () => {
  const data = await graphql(
    `
      query ProjectContext($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            fields(first: 50) {
              nodes {
                __typename
                ... on ProjectV2Field {
                  id
                  name
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
                ... on ProjectV2IterationField {
                  id
                  name
                  configuration {
                    iterations {
                      id
                      title
                      startDate
                      duration
                    }
                    completedIterations {
                      id
                      title
                      startDate
                      duration
                    }
                  }
                }
              }
            }
            items(first: 100) {
              nodes {
                id
                content {
                  __typename
                  ... on Issue {
                    id
                    number
                    state
                    closedAt
                    repository {
                      nameWithOwner
                    }
                  }
                }
                fieldValues(first: 30) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      iterationId
                      title
                      field {
                        ... on ProjectV2IterationField {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
  );

  const project = data.organization?.projectV2;
  if (!project) {
    throw new Error(`Project ${PROJECT_OWNER}#${PROJECT_NUMBER} was not found.`);
  }

  const statusField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2SingleSelectField" && field.name === STATUS_FIELD_NAME,
  );
  const sprintField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2IterationField" && field.name === SPRINT_FIELD_NAME,
  );
  const targetDateField = project.fields.nodes.find((field) => field.name === TARGET_DATE_FIELD_NAME);

  if (!statusField) {
    throw new Error(`Project is missing the ${STATUS_FIELD_NAME} field.`);
  }

  const statusOptionIds = new Map(statusField.options.map((option) => [option.name, option.id]));
  const currentIteration = getCurrentIteration(sprintField);
  const itemsByIssueNumber = new Map();

  for (const node of project.items.nodes) {
    if (node.content?.__typename !== "Issue") {
      continue;
    }

    if (node.content.repository?.nameWithOwner !== `${repoOwner}/${repoName}`) {
      continue;
    }

    const statusValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === STATUS_FIELD_NAME && typeof value.name === "string",
    );
    const sprintValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === SPRINT_FIELD_NAME && typeof value.iterationId === "string",
    );
    const targetDateValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === TARGET_DATE_FIELD_NAME && typeof value.date === "string",
    );

    itemsByIssueNumber.set(node.content.number, {
      itemId: node.id,
      issueId: node.content.id,
      issueNumber: node.content.number,
      issueState: node.content.state,
      issueClosedAt: formatDate(node.content.closedAt),
      status: statusValue?.name || null,
      sprintIterationId: sprintValue?.iterationId || null,
      sprintTitle: sprintValue?.title || null,
      targetDate: targetDateValue?.date || null,
    });
  }

  return {
    projectId: project.id,
    statusFieldId: statusField.id,
    statusOptionIds,
    sprintFieldId: sprintField?.id || null,
    targetDateFieldId: targetDateField?.id || null,
    currentIteration,
    itemsByIssueNumber,
  };
};

const getCurrentIteration = (sprintField) => {
  if (!sprintField?.configuration) {
    return null;
  }

  const allIterations = [
    ...(sprintField.configuration.completedIterations || []),
    ...(sprintField.configuration.iterations || []),
  ];

  if (allIterations.length === 0) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...allIterations].sort((left, right) => left.startDate.localeCompare(right.startDate));

  const active = sorted.find((iteration) => {
    const start = new Date(`${iteration.startDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + iteration.duration);
    const current = new Date(`${today}T00:00:00Z`);
    return current >= start && current < end;
  });

  if (active) {
    return active;
  }

  const latestStarted = [...sorted].reverse().find((iteration) => iteration.startDate <= today);
  return latestStarted || sorted[0];
};

const getIssue = async (issueNumber) => {
  const data = await graphql(
    `
      query IssueByNumber($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            id
            number
            state
            closedAt
          }
        }
      }
    `,
    { owner: repoOwner, repo: repoName, issueNumber },
  );

  const issue = data.repository?.issue;
  if (!issue) {
    return null;
  }

  return {
    id: issue.id,
    number: issue.number,
    state: issue.state,
    closedAt: formatDate(issue.closedAt),
  };
};

const getLinkedIssuesForPullRequest = async (pullRequestNumber) => {
  const data = await graphql(
    `
      query PullRequestIssues($owner: String!, $repo: String!, $pullRequestNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pullRequestNumber) {
            headRefName
            closingIssuesReferences(first: 20) {
              nodes {
                id
                number
                state
                closedAt
              }
            }
          }
        }
      }
    `,
    { owner: repoOwner, repo: repoName, pullRequestNumber },
  );

  const pullRequest = data.repository?.pullRequest;
  if (!pullRequest) {
    return [];
  }

  const linked =
    pullRequest.closingIssuesReferences?.nodes?.map((issue) => ({
      id: issue.id,
      number: issue.number,
      state: issue.state,
      closedAt: formatDate(issue.closedAt),
    })) || [];

  if (linked.length > 0) {
    return linked;
  }

  const inferredIssueNumber = parseIssueNumberFromBranch(pullRequest.headRefName || "");
  if (!inferredIssueNumber) {
    return [];
  }

  const inferredIssue = await getIssue(inferredIssueNumber);
  return inferredIssue ? [inferredIssue] : [];
};

const parseIssueNumberFromBranch = (branchName) => {
  const segments = branchName.split("/").filter(Boolean);

  for (const segment of segments) {
    let match = segment.match(/^(?:issue|issues)-?(\d+)(?:$|[-_].*)/i);
    if (match) {
      return Number(match[1]);
    }

    match = segment.match(/^(\d+)(?:$|[-_].*)/);
    if (match) {
      return Number(match[1]);
    }
  }

  const fallback = branchName.match(/(?:^|[/-])(\d+)(?=$|[-_])/);
  return fallback ? Number(fallback[1]) : null;
};

const ensureItem = async (project, issue) => {
  const existing = project.itemsByIssueNumber.get(issue.number);
  if (existing) {
    existing.issueState = issue.state;
    existing.issueClosedAt = issue.closedAt || existing.issueClosedAt;
    return existing;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] add issue #${issue.number} to project`);
    return {
      itemId: null,
      issueId: issue.id,
      issueNumber: issue.number,
      issueState: issue.state,
      issueClosedAt: issue.closedAt || null,
      status: null,
      sprintIterationId: null,
      sprintTitle: null,
      targetDate: null,
    };
  }

  const data = await graphql(
    `
      mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item {
            id
          }
        }
      }
    `,
    { projectId: project.projectId, contentId: issue.id },
  );

  const item = {
    itemId: data.addProjectV2ItemById.item.id,
    issueId: issue.id,
    issueNumber: issue.number,
    issueState: issue.state,
    issueClosedAt: issue.closedAt || null,
    status: null,
    sprintIterationId: null,
    sprintTitle: null,
    targetDate: null,
  };

  project.itemsByIssueNumber.set(issue.number, item);
  console.log(`Added issue #${issue.number} to project`);
  return item;
};

const setStatus = async (project, item, statusName) => {
  if (!item.itemId) {
    return;
  }

  if (item.status === statusName) {
    return;
  }

  const optionId = project.statusOptionIds.get(statusName);
  if (!optionId) {
    throw new Error(`Unknown status option: ${statusName}`);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} status: ${item.status || "unset"} -> ${statusName}`);
    item.status = statusName;
    return;
  }

  await graphql(
    `
      mutation SetProjectStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      projectId: project.projectId,
      itemId: item.itemId,
      fieldId: project.statusFieldId,
      optionId,
    },
  );

  item.status = statusName;
  console.log(`Set issue #${item.issueNumber} status to ${statusName}`);
};

const setSprint = async (project, item) => {
  if (!project.sprintFieldId || !project.currentIteration || !item.itemId) {
    return;
  }

  if (item.sprintIterationId === project.currentIteration.id) {
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} sprint -> ${project.currentIteration.title}`);
    item.sprintIterationId = project.currentIteration.id;
    item.sprintTitle = project.currentIteration.title;
    return;
  }

  await graphql(
    `
      mutation SetProjectSprint($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { iterationId: $iterationId }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      projectId: project.projectId,
      itemId: item.itemId,
      fieldId: project.sprintFieldId,
      iterationId: project.currentIteration.id,
    },
  );

  item.sprintIterationId = project.currentIteration.id;
  item.sprintTitle = project.currentIteration.title;
  console.log(`Set issue #${item.issueNumber} sprint to ${project.currentIteration.title}`);
};

const setTargetDate = async (project, item, dateValue) => {
  const nextDate = formatDate(dateValue);
  if (!project.targetDateFieldId || !item.itemId || !nextDate) {
    return;
  }

  if (item.targetDate === nextDate) {
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} target date -> ${nextDate}`);
    item.targetDate = nextDate;
    return;
  }

  await graphql(
    `
      mutation SetProjectTargetDate($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { date: $date }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      projectId: project.projectId,
      itemId: item.itemId,
      fieldId: project.targetDateFieldId,
      date: nextDate,
    },
  );

  item.targetDate = nextDate;
  console.log(`Set issue #${item.issueNumber} target date to ${nextDate}`);
};

const clearTargetDate = async (project, item) => {
  if (!project.targetDateFieldId || !item.itemId || !item.targetDate) {
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] clear target date on #${item.issueNumber}`);
    item.targetDate = null;
    return;
  }

  await graphql(
    `
      mutation ClearProjectTargetDate($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
        clearProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      projectId: project.projectId,
      itemId: item.itemId,
      fieldId: project.targetDateFieldId,
    },
  );

  item.targetDate = null;
  console.log(`Cleared target date on issue #${item.issueNumber}`);
};

const hasClosingReference = (body, issueNumber) => {
  if (!body || !issueNumber) {
    return false;
  }

  const pattern = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+#${issueNumber}\\b`,
    "i",
  );
  return pattern.test(body);
};

const updatePullRequestBody = async (pullRequestNumber, body, issueNumber) => {
  if (!issueNumber || hasClosingReference(body, issueNumber) || CLOSING_REFERENCE_PATTERN.test(body || "")) {
    return;
  }

  const nextBody = `${body ? body.trimEnd() : ""}\n\nCloses #${issueNumber}`.trim();

  if (DRY_RUN) {
    console.log(`[dry-run] append closing reference to PR #${pullRequestNumber}: Closes #${issueNumber}`);
    return;
  }

  await rest(`/repos/${repoOwner}/${repoName}/pulls/${pullRequestNumber}`, {
    method: "PATCH",
    body: { body: nextBody },
  });

  console.log(`Updated PR #${pullRequestNumber} body with Closes #${issueNumber}`);
};

const syncIssue = async (project, issue, statusName, options = {}) => {
  const item = await ensureItem(project, issue);
  await setStatus(project, item, statusName);

  if (options.assignSprint ?? ACTIVE_SPRINT_STATUSES.has(statusName)) {
    await setSprint(project, item);
  }

  if (options.clearTargetDate) {
    await clearTargetDate(project, item);
  }

  if (options.targetDate) {
    await setTargetDate(project, item, options.targetDate);
  }
};

const handleIssueEvent = async () => {
  const issue = payload.issue;
  if (!issue || payload.issue?.pull_request) {
    return;
  }

  const project = await getProjectContext();
  const issueDetails = {
    id: issue.node_id,
    number: issue.number,
    state: issue.state,
    stateReason: normalizeStateReason(issue.state_reason || issue.stateReason),
    closedAt: formatDate(issue.closed_at || issue.closedAt),
  };

  if (eventAction === "opened" || eventAction === "reopened") {
    await syncIssue(project, issueDetails, "Backlog", {
      assignSprint: true,
      clearTargetDate: true,
    });
    return;
  }

  if (eventAction === "closed") {
    const existing = project.itemsByIssueNumber.get(issue.number);
    const nextStatus =
      existing?.status && CLOSED_STATUS_NAMES.has(existing.status)
        ? existing.status
        : issueDetails.stateReason === "not_planned"
          ? "Canceled"
          : "Done";

    await syncIssue(project, issueDetails, nextStatus, {
      assignSprint: false,
      targetDate: issueDetails.closedAt || formatDate(new Date()),
    });
  }
};

const handleBranchCreated = async () => {
  if (payload.ref_type !== "branch") {
    return;
  }

  const issueNumber = parseIssueNumberFromBranch(payload.ref || "");
  if (!issueNumber) {
    console.log("Branch name does not map to an issue number. Skipping.");
    return;
  }

  const issue = await getIssue(issueNumber);
  if (!issue) {
    console.log(`No issue found for branch ${payload.ref}.`);
    return;
  }

  const project = await getProjectContext();
  await syncIssue(project, issue, "In Progress", {
    assignSprint: true,
    clearTargetDate: true,
  });
};

const handlePullRequestEvent = async () => {
  const pullRequest = payload.pull_request;
  if (!pullRequest) {
    return;
  }

  const inferredIssueNumber = parseIssueNumberFromBranch(pullRequest.head?.ref || "");
  if (eventAction !== "closed") {
    await updatePullRequestBody(pullRequest.number, pullRequest.body || "", inferredIssueNumber);
  }

  const project = await getProjectContext();
  const issues = await getLinkedIssuesForPullRequest(pullRequest.number);

  if (issues.length === 0) {
    console.log(`No linked issues found for PR #${pullRequest.number}.`);
    return;
  }

  let nextStatus = null;
  let assignSprint = false;
  let clearDate = false;
  let targetDate = null;

  if (eventAction === "closed" && pullRequest.merged) {
    nextStatus = "Done";
    targetDate = formatDate(pullRequest.merged_at || pullRequest.closed_at || new Date());
  } else if (eventAction === "closed" && !pullRequest.merged) {
    nextStatus = "In Progress";
    assignSprint = true;
    clearDate = true;
  } else if (eventAction === "converted_to_draft") {
    nextStatus = "In Progress";
    assignSprint = true;
    clearDate = true;
  } else {
    nextStatus = "In Review";
    assignSprint = true;
    clearDate = true;
  }

  for (const issue of issues) {
    if (nextStatus !== "Done" && issue.state === "CLOSED") {
      console.log(`Skipping closed issue #${issue.number} for PR #${pullRequest.number}.`);
      continue;
    }

    await syncIssue(project, issue, nextStatus, {
      assignSprint,
      clearTargetDate: clearDate,
      targetDate,
    });
  }
};

const runRollover = async () => {
  const project = await getProjectContext();

  for (const item of project.itemsByIssueNumber.values()) {
    if (!item.status) {
      const fallbackStatus = item.issueState === "CLOSED" ? "Done" : "Backlog";
      await setStatus(project, item, fallbackStatus);
      item.status = fallbackStatus;
    }

    if (CLOSED_STATUS_NAMES.has(item.status)) {
      if (!item.targetDate) {
        await setTargetDate(project, item, item.issueClosedAt || formatDate(new Date()));
      }
      continue;
    }

    await setSprint(project, item);
    await clearTargetDate(project, item);
  }
};

const main = async () => {
  console.log(`Running project board sync for ${eventName}${eventAction ? `:${eventAction}` : ""}`);

  if (eventName === "issues") {
    await handleIssueEvent();
    return;
  }

  if (eventName === "create") {
    await handleBranchCreated();
    return;
  }

  if (eventName === "pull_request_target") {
    await handlePullRequestEvent();
    return;
  }

  if (eventName === "schedule" || eventName === "workflow_dispatch") {
    await runRollover();
    return;
  }

  console.log("Event is not configured for project sync. Skipping.");
};

await main();
