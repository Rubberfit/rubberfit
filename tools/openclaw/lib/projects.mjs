// GitHub Projects v2 GraphQL helpers — used by issue triage to set
// Priority, Story Points, and Status on the project board after the
// model emits a verdict.
//
// Each install configures `OPENCLAW_PROJECT_ID` (e.g. PVT_kwDOD7DDt84BUM5C)
// pointing at the org's canonical project. Field/option IDs are discovered
// at runtime from the project schema so different orgs can re-use OpenClaw
// without code edits.

/**
 * Discover the project's field configuration. Returns a map keyed by
 * field name (lower-cased) with `{ id, options: Map<lower-name, id> }`
 * for single-select fields. Non-single-select fields just carry `id`.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<unknown>} _restClient unused
 * @param {(query: string, variables?: object) => Promise<unknown>} graphql
 * @param {string} projectId  e.g. PVT_kwDOD7DDt84BUM5C
 */
export async function getProjectFieldMap(graphql, projectId) {
  const data = await graphql(
    `
      query ($id: ID!) {
        node(id: $id) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
    { id: projectId }
  )
  const nodes = data?.node?.fields?.nodes ?? []
  const map = {}
  for (const f of nodes) {
    if (!f?.name) continue
    const entry = { id: f.id, dataType: f.dataType, options: {} }
    for (const opt of f.options ?? []) {
      entry.options[opt.name.toLowerCase()] = opt.id
    }
    map[f.name.toLowerCase()] = entry
  }
  return map
}

/**
 * Add an issue (by GraphQL node id) to the project, returning the
 * resulting project-item id. If the issue is already on the project,
 * GitHub returns the existing item — same id either way.
 */
export async function addOrFindProjectItem(graphql, projectId, issueNodeId) {
  const data = await graphql(
    `
      mutation ($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item {
            id
          }
        }
      }
    `,
    { projectId, contentId: issueNodeId }
  )
  return data?.addProjectV2ItemById?.item?.id ?? null
}

/**
 * Set a single-select field on a project item. `optionId` must come
 * from the field map returned by `getProjectFieldMap`.
 */
export async function setSingleSelectField(graphql, projectId, itemId, fieldId, optionId) {
  await graphql(
    `
      mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
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
    { projectId, itemId, fieldId, optionId }
  )
}

/**
 * Apply project-board updates from a verdict. Skips silently for any
 * field/option that doesn't exist on the project (different orgs may
 * not configure all of Priority / Story Points / Status). Caller maps
 * verdict.estimate → "1"|"2"|"3"|"5"|"8"|"13" and verdict.severity →
 * "P0"|"P1"|"P2"|"P3" before invoking.
 */
export async function applyProjectVerdict(graphql, projectId, itemId, fieldMap, updates) {
  for (const [fieldName, optionLabel] of Object.entries(updates)) {
    if (optionLabel == null) continue
    const field = fieldMap[fieldName.toLowerCase()]
    if (!field) continue
    const optionId = field.options[String(optionLabel).toLowerCase()]
    if (!optionId) continue
    await setSingleSelectField(graphql, projectId, itemId, field.id, optionId)
  }
}
