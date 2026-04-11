import { readFile } from "node:fs/promises";

const PROJECT_OWNER = process.env.PROJECT_OWNER;
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || "1");
const STATUS_FIELD_NAME = "Status";
const PRIORITY_FIELD_NAME = "Priority";
const STORY_POINTS_FIELD_NAME = "Story Points";
const SPRINT_FIELD_NAME = "Sprint";
const TARGET_DATE_FIELD_NAME = "Target date";
const REQUESTED_REVIEWERS_FIELD_NAME = "Requested reviewer";
const ACTIVE_SPRINT_STATUSES = new Set(["Backlog", "Todo", "In Progress", "Blocked", "In Review"]);
const CLOSED_STATUS_NAMES = new Set(["Done", "Canceled"]);
const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MANAGED_LABELS = new Set(["request", "intern", "performance", "cut-planner", "refactor", "ui"]);
const DEFAULT_PRIORITY = "P2";
const DEFAULT_STORY_POINTS = "3";
const BUG_PATTERNS = [
  /\bbug\b/i,
  /\bfix(?:e[sd])?\b/i,
  /\berror\b/i,
  /\bbroken\b/i,
  /\bwrong\b/i,
  /\bfail(?:ing|s|ed)?\b/i,
  /\bcrash(?:es|ed|ing)?\b/i,
  /\bmissing\b/i,
  /\boverlap(?:ping)?\b/i,
  /\binvalid\b/i,
  /\bincorrect\b/i,
  /\bnot working\b/i,
  /\bunable\b/i,
  /\bcan(?:not|'t)\b/i,
  /\bregression\b/i,
];
const FEATURE_PATTERNS = [
  /\bfeature\b/i,
  /\bimplement\b/i,
  /\badd\b/i,
  /\bcreate\b/i,
  /\ballow\b/i,
  /\benable\b/i,
  /\bsupport\b/i,
  /\bintroduce\b/i,
  /\bbuild\b/i,
  /\brequest(?:ed)?\b/i,
];
const REFACTOR_PATTERNS = [
  /\brefactor\b/i,
  /\brestructure\b/i,
  /\bsimplif(?:y|ication)\b/i,
  /\bmigrate\b/i,
  /\bmaintainab(?:le|ility)\b/i,
  /\btechnical debt\b/i,
];
const PERFORMANCE_PATTERNS = [
  /\bperformance\b/i,
  /\boptimi[sz]e\b/i,
  /\bslow\b/i,
  /\blag(?:gy)?\b/i,
  /\bhang(?:s|ing)?\b/i,
  /\bfreeze(?:s|d|ing)?\b/i,
  /\bresponsive(?:ness)?\b/i,
];
const CUT_PLANNER_PATTERNS = [
  /\bcut planner\b/i,
  /\bcut plan\b/i,
  /\bpacking\b/i,
  /\bnesting\b/i,
  /\bsheet\b/i,
  /\bgeometry\b/i,
  /\bcone(?:s)?\b/i,
  /\btrapezoid(?:s)?\b/i,
];
const UI_PATTERNS = [
  /\bui\b/i,
  /\bux\b/i,
  /\bbutton\b/i,
  /\bmodal\b/i,
  /\bdialog\b/i,
  /\bpage\b/i,
  /\bform\b/i,
  /\bdisplay\b/i,
  /\blayout\b/i,
  /\btable\b/i,
];
const REQUEST_PATTERNS = [
  /\bclient request(?:ed)?\b/i,
  /\bcustomer request(?:ed)?\b/i,
  /\bstakeholder\b/i,
  /\brequested\b/i,
  /\bwould like\b/i,
  /\basks? for\b/i,
];
const SIMPLE_PATTERNS = [
  /\btypo\b/i,
  /\bcopy\b/i,
  /\btext\b/i,
  /\bspell(?:ing)?\b/i,
  /\brename\b/i,
  /\bminor\b/i,
  /\bnit\b/i,
  /\bsmall\b/i,
  /\bcleanup\b/i,
];
const LARGE_PATTERNS = [
  /\bentire\b/i,
  /\bwhole\b/i,
  /\bportal\b/i,
  /\bacross\b/i,
  /\bsystem(?:-wide)?\b/i,
  /\bend-to-end\b/i,
  /\boverhaul\b/i,
  /\brewrite\b/i,
  /\bmigration\b/i,
  /\bmultiple\b/i,
  /\ball (?:pages|components|services|modules|screens|workflows|tables|sheets?)\b/i,
];
const P0_PATTERNS = [
  /\bp0\b/i,
  /\bblocker\b/i,
  /\bproduction\b/i,
  /\boutage\b/i,
  /\bsecurity\b/i,
  /\bdata loss\b/i,
  /\bdown\b/i,
];
const P1_PATTERNS = [
  /\bp1\b/i,
  /\burgent\b/i,
  /\bcrash(?:es|ed|ing)?\b/i,
  /\bregression\b/i,
  /\bbroken\b/i,
  /\bnot working\b/i,
  /\bunable\b/i,
  /\bcan(?:not|'t)\b/i,
  /\bfail(?:ing|s|ed)?\b/i,
];
const P3_PATTERNS = [
  /\bp3\b/i,
  /\bdocs?\b/i,
  /\bdocumentation\b/i,
  /\bcopy\b/i,
  /\btypo\b/i,
  /\bpolish\b/i,
  /\bnice to have\b/i,
];
const DRY_RUN = process.env.DRY_RUN === "true";

const projectToken = process.env.PROJECT_TOKEN || process.env.GITHUB_TOKEN;
const repoToken = process.env.GITHUB_TOKEN || process.env.PROJECT_TOKEN;
const [repoOwner, repoName] = (process.env.GITHUB_REPOSITORY || "").split("/");

if (!projectToken) {
  throw new Error("Missing PROJECT_TOKEN or GITHUB_TOKEN.");
}

if (!PROJECT_OWNER || !repoOwner || !repoName) {
  throw new Error("Missing repository or project owner context.");
}

const loadPayload = async () => {
  if (!process.env.GITHUB_EVENT_PATH) {
    return {};
  }

  try {
    return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read GitHub event payload from ${process.env.GITHUB_EVENT_PATH}: ${message}`);
  }
};

const payload = await loadPayload();

const eventName = process.env.GITHUB_EVENT_NAME || "";
const eventAction = payload.action || "";
const normalizeStateReason = (value) => (value ? String(value).toLowerCase() : null);
const normalizeIssueState = (value) => (value ? String(value).trim().toUpperCase() : null);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const formatGraphqlContext = (operationName, variables) => {
  const trimmedVariables = JSON.stringify(variables).slice(0, 400);
  return `${operationName} variables=${trimmedVariables}`;
};

const graphql = async (query, variables = {}, operationName = "GraphQLRequest") => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${projectToken}`,
      "Content-Type": "application/json",
      "User-Agent": "rema-project-board-sync",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub GraphQL request failed with ${response.status} (${formatGraphqlContext(operationName, variables)}).`,
    );
  }

  const body = await response.json();
  if (body.errors?.length) {
    const message = body.errors.map((error) => error.message).join("; ");
    throw new Error(`GitHub GraphQL error (${formatGraphqlContext(operationName, variables)}): ${message}`);
  }

  return body.data;
};

const assertConnectionComplete = (connectionName, pageInfo) => {
  if (pageInfo?.hasNextPage) {
    throw new Error(`${connectionName} exceeded the configured GitHub pagination window.`);
  }
};

const countMatches = (text, patterns) => patterns.filter((pattern) => pattern.test(text)).length;
const hasAnyPattern = (text, patterns) => patterns.some((pattern) => pattern.test(text));
const parseIssueNumbersFromPullRequestBody = (body) => {
  if (!body) {
    return [];
  }

  const issueNumbers = new Set();
  const plainTextBody = body.replace(/\[[^\]]*]\((?:[^)]+)\)/g, " ");
  const sameRepoIssueUrlPattern = new RegExp(
    `(?:https://github\\.com)?/${escapeRegExp(repoOwner)}/${escapeRegExp(repoName)}/issues/(\\d+)(?:[/?#][^\\s)]*)?`,
    "gi",
  );
  const sameRepoReferencePattern = new RegExp(`${escapeRegExp(repoOwner)}/${escapeRegExp(repoName)}#(\\d+)`, "gi");
  const shorthandReferencePattern = /(?:^|[^\w/])#(\d+)\b/g;

  for (const match of body.matchAll(sameRepoIssueUrlPattern)) {
    issueNumbers.add(Number(match[1]));
  }

  for (const match of body.matchAll(sameRepoReferencePattern)) {
    issueNumbers.add(Number(match[1]));
  }

  for (const match of plainTextBody.matchAll(shorthandReferencePattern)) {
    issueNumbers.add(Number(match[1]));
  }

  return [...issueNumbers];
};

const deriveIssueType = (text) => {
  const bugScore = countMatches(text, BUG_PATTERNS);
  const featureScore = countMatches(text, FEATURE_PATTERNS);
  const refactorScore = countMatches(text, REFACTOR_PATTERNS);

  if (bugScore > 0 && bugScore >= featureScore) {
    return "Bug";
  }

  if (featureScore > 0 && featureScore >= refactorScore) {
    return "Feature";
  }

  return "Task";
};

const derivePriority = (text) => {
  if (hasAnyPattern(text, P0_PATTERNS)) {
    return "P0";
  }

  if (hasAnyPattern(text, P1_PATTERNS)) {
    return "P1";
  }

  if (hasAnyPattern(text, P3_PATTERNS)) {
    return "P3";
  }

  return DEFAULT_PRIORITY;
};

const deriveStoryPoints = (text, issueType) => {
  if (hasAnyPattern(text, LARGE_PATTERNS) && (hasAnyPattern(text, PERFORMANCE_PATTERNS) || hasAnyPattern(text, REFACTOR_PATTERNS))) {
    return "6";
  }

  if (hasAnyPattern(text, SIMPLE_PATTERNS) && !hasAnyPattern(text, LARGE_PATTERNS)) {
    return issueType === "Bug" ? "2" : "1";
  }

  let points = DEFAULT_STORY_POINTS;

  if (issueType === "Bug") {
    points = "2";
  }

  if (issueType === "Feature" || hasAnyPattern(text, UI_PATTERNS)) {
    points = String(Math.max(Number(points), 4));
  }

  if (hasAnyPattern(text, PERFORMANCE_PATTERNS) || hasAnyPattern(text, CUT_PLANNER_PATTERNS) || hasAnyPattern(text, REFACTOR_PATTERNS)) {
    points = String(Math.max(Number(points), 4));
  }

  const multiSurfaceScore = countMatches(text, [
    ...PERFORMANCE_PATTERNS,
    ...CUT_PLANNER_PATTERNS,
    ...REFACTOR_PATTERNS,
    ...FEATURE_PATTERNS,
    ...LARGE_PATTERNS,
  ]);
  if (multiSurfaceScore >= 3) {
    points = "5";
  }

  if (hasAnyPattern(text, LARGE_PATTERNS) && Number(points) >= 5) {
    return "6";
  }

  return points;
};

const deriveManagedLabels = (text) => {
  const labels = new Set();

  if (hasAnyPattern(text, REQUEST_PATTERNS)) {
    labels.add("request");
  }

  if (hasAnyPattern(text, PERFORMANCE_PATTERNS)) {
    labels.add("performance");
  }

  if (hasAnyPattern(text, CUT_PLANNER_PATTERNS)) {
    labels.add("cut-planner");
  }

  if (hasAnyPattern(text, REFACTOR_PATTERNS)) {
    labels.add("refactor");
  }

  if (hasAnyPattern(text, UI_PATTERNS)) {
    labels.add("ui");
  }

  if (/\bintern\b/i.test(text)) {
    labels.add("intern");
  }

  return [...labels];
};

const classifyIssueFromRepositoryContext = (issue) => {
  const text = `${issue.title || ""}\n${issue.body || ""}`;
  const issueType = deriveIssueType(text);
  const priority = derivePriority(text);
  const storyPoints = deriveStoryPoints(text, issueType);

  return {
    issueType,
    priority,
    storyPoints,
    labels: deriveManagedLabels(text),
  };
};

const isTrustedPullRequest = (pullRequest) => {
  if (!pullRequest) {
    return true;
  }

  if (pullRequest.head?.repo?.full_name === `${repoOwner}/${repoName}`) {
    return true;
  }

  const association = String(pullRequest.author_association || pullRequest.authorAssociation || "").toUpperCase();
  return TRUSTED_AUTHOR_ASSOCIATIONS.has(association);
};

const rest = async (path, { method = "GET", body } = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${repoToken}`,
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
          issueTypes(first: 20) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              name
            }
          }
          projectV2(number: $number) {
            id
            fields(first: 50) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                __typename
                ... on ProjectV2Field {
                  id
                  name
                  dataType
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
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                content {
                  __typename
                  ... on Issue {
                    id
                    number
                    state
                    closedAt
                    issueType {
                      id
                      name
                    }
                    repository {
                      nameWithOwner
                    }
                  }
                }
                fieldValues(first: 50) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
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
                    ... on ProjectV2ItemFieldTextValue {
                      text
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
    "ProjectContext",
  );

  const project = data.organization?.projectV2;
  if (!project) {
    throw new Error(`Project ${PROJECT_OWNER}#${PROJECT_NUMBER} was not found.`);
  }

  const issueTypes = data.organization?.issueTypes;
  assertConnectionComplete("organization issue types", issueTypes?.pageInfo);

  const statusField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2SingleSelectField" && field.name === STATUS_FIELD_NAME,
  );
  const priorityField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2SingleSelectField" && field.name === PRIORITY_FIELD_NAME,
  );
  const storyPointsField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2SingleSelectField" && field.name === STORY_POINTS_FIELD_NAME,
  );
  const sprintField = project.fields.nodes.find(
    (field) => field.__typename === "ProjectV2IterationField" && field.name === SPRINT_FIELD_NAME,
  );
  const targetDateField = project.fields.nodes.find((field) => field.name === TARGET_DATE_FIELD_NAME);
  const requestedReviewersField = project.fields.nodes.find(
    (field) => field.name === REQUESTED_REVIEWERS_FIELD_NAME && field.dataType === "TEXT",
  );

  if (!requestedReviewersField) {
    console.warn(
      `Project ${PROJECT_OWNER}#${PROJECT_NUMBER} is missing the ${REQUESTED_REVIEWERS_FIELD_NAME} text field. Reviewer sync will be skipped.`,
    );
  }

  if (!statusField) {
    throw new Error(`Project is missing the ${STATUS_FIELD_NAME} field.`);
  }

  if (!priorityField) {
    throw new Error(`Project is missing the ${PRIORITY_FIELD_NAME} field.`);
  }

  if (!storyPointsField) {
    throw new Error(`Project is missing the ${STORY_POINTS_FIELD_NAME} field.`);
  }

  assertConnectionComplete("project fields", project.fields.pageInfo);
  assertConnectionComplete("project items", project.items.pageInfo);

  const statusOptionIds = new Map(statusField.options.map((option) => [option.name, option.id]));
  const priorityOptionIds = new Map(priorityField.options.map((option) => [option.name, option.id]));
  const storyPointOptionIds = new Map(storyPointsField.options.map((option) => [option.name, option.id]));
  const issueTypeIds = new Map((issueTypes?.nodes || []).map((issueType) => [issueType.name, issueType.id]));
  const currentIteration = getCurrentIteration(sprintField);
  const itemsByIssueNumber = new Map();

  for (const node of project.items.nodes) {
    assertConnectionComplete(
      node.content?.__typename === "Issue"
        ? `project field values for issue #${node.content.number}`
        : `project field values for item ${node.id}`,
      node.fieldValues.pageInfo,
    );

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
    const priorityValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === PRIORITY_FIELD_NAME && typeof value.name === "string",
    );
    const storyPointsValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === STORY_POINTS_FIELD_NAME && typeof value.name === "string",
    );
    const targetDateValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === TARGET_DATE_FIELD_NAME && typeof value.date === "string",
    );
    const requestedReviewersValue = node.fieldValues.nodes.find(
      (value) => value.field?.name === REQUESTED_REVIEWERS_FIELD_NAME && typeof value.text === "string",
    );

    itemsByIssueNumber.set(node.content.number, {
      itemId: node.id,
      issueId: node.content.id,
      issueNumber: node.content.number,
      issueState: node.content.state,
      issueClosedAt: formatDate(node.content.closedAt),
      issueType: node.content.issueType?.name || null,
      status: statusValue?.name || null,
      priority: priorityValue?.name || null,
      storyPoints: storyPointsValue?.name || null,
      sprintIterationId: sprintValue?.iterationId || null,
      sprintTitle: sprintValue?.title || null,
      targetDate: targetDateValue?.date || null,
      requestedReviewers: requestedReviewersValue?.text || null,
    });
  }

  return {
    projectId: project.id,
    issueTypeIds,
    statusFieldId: statusField.id,
    statusOptionIds,
    priorityFieldId: priorityField.id,
    priorityOptionIds,
    storyPointsFieldId: storyPointsField.id,
    storyPointOptionIds,
    sprintFieldId: sprintField?.id || null,
    targetDateFieldId: targetDateField?.id || null,
    requestedReviewersFieldId: requestedReviewersField?.id || null,
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
            issueType {
              name
            }
          }
        }
      }
    `,
    { owner: repoOwner, repo: repoName, issueNumber },
    "IssueByNumber",
  );

  const issue = data.repository?.issue;
  if (!issue) {
    return null;
  }

  return {
    id: issue.id,
    number: issue.number,
    state: normalizeIssueState(issue.state),
    closedAt: formatDate(issue.closedAt),
    issueType: issue.issueType?.name || null,
  };
};

const getLinkedIssuesForPullRequest = async (pullRequestNumber) => {
  const data = await graphql(
    `
      query PullRequestIssues($owner: String!, $repo: String!, $pullRequestNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pullRequestNumber) {
            body
            headRefName
            closingIssuesReferences(first: 20) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                number
                state
                closedAt
                issueType {
                  name
                }
              }
            }
          }
        }
      }
    `,
    { owner: repoOwner, repo: repoName, pullRequestNumber },
    "PullRequestIssues",
  );

  const pullRequest = data.repository?.pullRequest;
  if (!pullRequest) {
    return [];
  }

  assertConnectionComplete(`linked issues for PR #${pullRequestNumber}`, pullRequest.closingIssuesReferences.pageInfo);

  const linked =
    pullRequest.closingIssuesReferences?.nodes?.map((issue) => ({
      id: issue.id,
      number: issue.number,
      state: normalizeIssueState(issue.state),
      closedAt: formatDate(issue.closedAt),
      issueType: issue.issueType?.name || null,
    })) || [];

  if (linked.length > 0) {
    return linked;
  }

  const candidateIssueNumbers = getPullRequestIssueCandidates(pullRequest.body || "", pullRequest.headRefName || "");
  if (candidateIssueNumbers.length === 0) {
    return [];
  }

  const inferredIssues = await Promise.allSettled(candidateIssueNumbers.map((issueNumber) => getIssue(issueNumber)));
  return inferredIssues.filter((result) => result.status === "fulfilled" && result.value).map((result) => result.value);
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

const getPullRequestIssueCandidates = (body, branchName) => {
  const issueNumbers = new Set(parseIssueNumbersFromPullRequestBody(body));
  const branchIssueNumber = parseIssueNumberFromBranch(branchName || "");

  if (branchIssueNumber) {
    issueNumbers.add(branchIssueNumber);
  }

  return [...issueNumbers];
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
      issueType: issue.issueType || null,
      status: null,
      priority: null,
      storyPoints: null,
      sprintIterationId: null,
      sprintTitle: null,
      targetDate: null,
      requestedReviewers: null,
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
    "AddIssueToProject",
  );

  const item = {
    itemId: data.addProjectV2ItemById.item.id,
    issueId: issue.id,
    issueNumber: issue.number,
    issueState: issue.state,
    issueClosedAt: issue.closedAt || null,
    issueType: issue.issueType || null,
    status: null,
    priority: null,
    storyPoints: null,
    sprintIterationId: null,
    sprintTitle: null,
    targetDate: null,
    requestedReviewers: null,
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
    "SetProjectStatus",
  );

  item.status = statusName;
  console.log(`Set issue #${item.issueNumber} status to ${statusName}`);
};

const setIssueType = async (project, item, issueTypeName) => {
  if (!item.issueId || !issueTypeName) {
    return;
  }

  if (item.issueType === issueTypeName) {
    return;
  }

  const issueTypeId = project.issueTypeIds.get(issueTypeName);
  if (!issueTypeId) {
    throw new Error(`Unknown issue type: ${issueTypeName}`);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} issue type: ${item.issueType || "unset"} -> ${issueTypeName}`);
    item.issueType = issueTypeName;
    return;
  }

  await graphql(
    `
      mutation SetIssueType($issueId: ID!, $issueTypeId: ID) {
        updateIssueIssueType(input: { issueId: $issueId, issueTypeId: $issueTypeId }) {
          issue {
            id
          }
        }
      }
    `,
    {
      issueId: item.issueId,
      issueTypeId,
    },
    "SetIssueType",
  );

  item.issueType = issueTypeName;
  console.log(`Set issue #${item.issueNumber} type to ${issueTypeName}`);
};

const setPriority = async (project, item, priorityName) => {
  if (!item.itemId || !priorityName) {
    return;
  }

  if (item.priority === priorityName) {
    return;
  }

  const optionId = project.priorityOptionIds.get(priorityName);
  if (!optionId) {
    throw new Error(`Unknown priority option: ${priorityName}`);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} priority: ${item.priority || "unset"} -> ${priorityName}`);
    item.priority = priorityName;
    return;
  }

  await graphql(
    `
      mutation SetProjectPriority($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
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
      fieldId: project.priorityFieldId,
      optionId,
    },
    "SetProjectPriority",
  );

  item.priority = priorityName;
  console.log(`Set issue #${item.issueNumber} priority to ${priorityName}`);
};

const setStoryPoints = async (project, item, storyPoints) => {
  if (!item.itemId || !storyPoints) {
    return;
  }

  if (item.storyPoints === storyPoints) {
    return;
  }

  const optionId = project.storyPointOptionIds.get(storyPoints);
  if (!optionId) {
    throw new Error(`Unknown story point option: ${storyPoints}`);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} story points: ${item.storyPoints || "unset"} -> ${storyPoints}`);
    item.storyPoints = storyPoints;
    return;
  }

  await graphql(
    `
      mutation SetProjectStoryPoints($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
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
      fieldId: project.storyPointsFieldId,
      optionId,
    },
    "SetProjectStoryPoints",
  );

  item.storyPoints = storyPoints;
  console.log(`Set issue #${item.issueNumber} story points to ${storyPoints}`);
};

const addLabels = async (issueNumber, labels) => {
  const nextLabels = [...new Set(labels.filter((label) => MANAGED_LABELS.has(label)))];
  if (nextLabels.length === 0) {
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] add labels to #${issueNumber}: ${nextLabels.join(", ")}`);
    return;
  }

  await rest(`/repos/${repoOwner}/${repoName}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: { labels: nextLabels },
  });

  console.log(`Added labels to issue #${issueNumber}: ${nextLabels.join(", ")}`);
};

const applyIssueDefaults = async (project, issue) => {
  const item = await ensureItem(project, issue);
  const classification = classifyIssueFromRepositoryContext(issue);

  if (!item.status && issue.state !== "CLOSED") {
    await setStatus(project, item, "Backlog");
    await setSprint(project, item);
    await clearTargetDate(project, item);
  }

  if (!item.issueType) {
    await setIssueType(project, item, classification.issueType);
  }

  if (!item.priority) {
    await setPriority(project, item, classification.priority);
  }

  if (!item.storyPoints) {
    await setStoryPoints(project, item, classification.storyPoints);
  }

  await addLabels(issue.number, classification.labels || []);
};

const syncNewIssue = async (project, issue) => {
  await syncIssue(project, issue, "Backlog", {
    assignSprint: true,
    clearTargetDate: true,
  });
  await applyIssueDefaults(project, issue);
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
    "SetProjectSprint",
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
    "SetProjectTargetDate",
  );

  item.targetDate = nextDate;
  console.log(`Set issue #${item.issueNumber} target date to ${nextDate}`);
};

const setRequestedReviewers = async (project, item, reviewers) => {
  if (!project.requestedReviewersFieldId || !item.itemId) {
    return;
  }

  const nextValue = reviewers ? reviewers.trim() : null;

  if (!nextValue) {
    if (!item.requestedReviewers) {
      return;
    }

    if (DRY_RUN) {
      console.log(`[dry-run] clear requested reviewers on #${item.issueNumber}`);
      item.requestedReviewers = null;
      return;
    }

    await graphql(
      `
        mutation ClearProjectRequestedReviewers($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
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
        fieldId: project.requestedReviewersFieldId,
      },
      "ClearProjectRequestedReviewers",
    );

    item.requestedReviewers = null;
    console.log(`Cleared requested reviewers on issue #${item.issueNumber}`);
    return;
  }

  if (item.requestedReviewers === nextValue) {
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] set #${item.issueNumber} requested reviewers -> ${nextValue}`);
    item.requestedReviewers = nextValue;
    return;
  }

  await graphql(
    `
      mutation SetProjectRequestedReviewers($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { text: $text }
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
      fieldId: project.requestedReviewersFieldId,
      text: nextValue,
    },
    "SetProjectRequestedReviewers",
  );

  item.requestedReviewers = nextValue;
  console.log(`Set issue #${item.issueNumber} requested reviewers to ${nextValue}`);
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
    "ClearProjectTargetDate",
  );

  item.targetDate = null;
  console.log(`Cleared target date on issue #${item.issueNumber}`);
};

const formatRequestedReviewers = (pullRequest) => {
  const reviewers = new Set();

  for (const reviewer of pullRequest?.requested_reviewers || []) {
    if (reviewer?.login) {
      reviewers.add(`@${reviewer.login}`);
    }
  }

  for (const team of pullRequest?.requested_teams || []) {
    if (team?.organization?.login && team?.slug) {
      reviewers.add(`@${team.organization.login}/${team.slug}`);
      continue;
    }

    if (team?.slug) {
      reviewers.add(`@${team.slug}`);
    }
  }

  return reviewers.size > 0 ? [...reviewers].sort().join(", ") : null;
};

const hasClosingReference = (body, issueNumber) => {
  if (!body || !issueNumber) {
    return false;
  }

  const sameRepoIssueUrlPattern = `(?:https://github\\.com)?/${escapeRegExp(repoOwner)}/${escapeRegExp(repoName)}/issues/${issueNumber}(?:[/?#][^\\s)]*)?`;
  const issueReferencePattern = [
    `#${issueNumber}\\b`,
    `${escapeRegExp(repoOwner)}/${escapeRegExp(repoName)}#${issueNumber}\\b`,
    sameRepoIssueUrlPattern,
    `\\[[^\\]]*\\]\\(${sameRepoIssueUrlPattern}\\)`,
  ].join("|");
  const pattern = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s*(?:${issueReferencePattern})`,
    "i",
  );
  return pattern.test(body);
};

const updatePullRequestBody = async (pullRequestNumber, body, issueNumber) => {
  if (!issueNumber || hasClosingReference(body, issueNumber)) {
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

  return item;
};

const buildIssueDetails = (issue) => ({
  id: issue.node_id,
  number: issue.number,
  state: normalizeIssueState(issue.state),
  stateReason: normalizeStateReason(issue.state_reason || issue.stateReason),
  closedAt: formatDate(issue.closed_at || issue.closedAt),
  issueType: issue.issue_type?.name || issue.issueType?.name || null,
  title: issue.title || "",
  body: issue.body || "",
});

const handleIssueEvent = async () => {
  const issue = payload.issue;
  if (!issue || payload.issue?.pull_request) {
    return;
  }

  const project = await getProjectContext();
  const issueDetails = buildIssueDetails(issue);

  if (eventAction === "opened" || eventAction === "reopened") {
    await syncNewIssue(project, issueDetails);
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

  if (!isTrustedPullRequest(pullRequest)) {
    console.log(`Skipping PR #${pullRequest.number} because it is not from a trusted source.`);
    return;
  }

  const candidateIssueNumbers = getPullRequestIssueCandidates(pullRequest.body || "", pullRequest.head?.ref || "");
  const issueNumberForBodyUpdate = candidateIssueNumbers.length === 1 ? candidateIssueNumbers[0] : null;
  if (eventAction !== "closed") {
    await updatePullRequestBody(pullRequest.number, pullRequest.body || "", issueNumberForBodyUpdate);
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
  const requestedReviewers = formatRequestedReviewers(pullRequest);

  if (eventAction === "closed" && pullRequest.merged) {
    nextStatus = "Done";
    targetDate = formatDate(pullRequest.merged_at || pullRequest.closed_at || new Date());
  } else if (eventAction === "closed" && !pullRequest.merged) {
    nextStatus = "In Progress";
    assignSprint = true;
    clearDate = true;
  } else if (eventAction === "converted_to_draft" || pullRequest.draft) {
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

    const item = await syncIssue(project, issue, nextStatus, {
      assignSprint,
      clearTargetDate: clearDate,
      targetDate,
    });

    if (eventAction === "closed" && pullRequest.merged) {
      continue;
    }

    await setRequestedReviewers(project, item, eventAction === "closed" ? null : requestedReviewers);
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

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
}
