// USAGE: node src/fetch_hierarchy.js
// Reconstructs the real parent/child tree for the Common Core Math
// framework using the /academic-standards/{id}/children endpoint (each
// parent node's actual children, not a guess from statementCode prefixes).
import fs from "fs";

const BASE_URL = "https://api.learningcommons.org/knowledge-graph/v0";
const headers = {
  "x-api-key":
    "sk_prod_07b88ff7-fd3f-4271-bec9-beaeccffded0_pmS7rMiHMccwvAZE2jDwqIYl3jYjDF8ps6U70KCH94HVYmmzyvU7818shEU0gn3w",
  Accept: "application/json",
};

async function getChildrenPage(nodeId, cursor) {
  const url = new URL(`${BASE_URL}/academic-standards/${nodeId}/children`);
  const params = { limit: "100" };
  if (cursor) params.cursor = cursor;
  url.search = new URLSearchParams(params);

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching children of ${nodeId}`);
  }
  return response.json();
}

async function getAllChildren(nodeId) {
  let all = [];
  let cursor = null;
  while (true) {
    const result = await getChildrenPage(nodeId, cursor);
    all = all.concat(result.data || []);
    if (!result.pagination?.hasMore) break;
    cursor = result.pagination.nextCursor;
  }
  return all;
}

// Simple concurrency pool so we don't fire 282 requests at once, but also
// don't run them fully sequentially (would be slow).
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function runNext() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

(async () => {
  const raw = JSON.parse(fs.readFileSync("all_data.json", "utf-8"));
  const fwId = Object.keys(raw.standardsByFramework)[0];
  const { framework, standards } = raw.standardsByFramework[fwId];

  const nodesById = new Map();
  for (const item of standards) {
    nodesById.set(item.caseIdentifierUUID, { ...item, childIds: [] });
  }

  const parentsToFetch = standards.filter((s) => s.hasChildren);
  console.log(`Fetching children for ${parentsToFetch.length} parent nodes...`);

  let done = 0;
  const childIdSet = new Set();

  await mapWithConcurrency(parentsToFetch, 8, async (parent) => {
    const children = await getAllChildren(parent.caseIdentifierUUID);
    const node = nodesById.get(parent.caseIdentifierUUID);
    node.childIds = children.map((c) => c.caseIdentifierUUID);
    for (const c of children) {
      childIdSet.add(c.caseIdentifierUUID);
      // A child may reference a node not present in the flat 836-item list
      // (shouldn't normally happen, but guard against it) — register it too.
      if (!nodesById.has(c.caseIdentifierUUID)) {
        nodesById.set(c.caseIdentifierUUID, { ...c, childIds: [] });
      }
    }
    done++;
    if (done % 25 === 0 || done === parentsToFetch.length) {
      console.log(`  ${done}/${parentsToFetch.length} parents fetched...`);
    }
  });

  // Roots = nodes never referenced as anyone's child.
  const roots = [...nodesById.values()].filter(
    (node) => !childIdSet.has(node.caseIdentifierUUID),
  );

  console.log(`\nTotal nodes: ${nodesById.size}`);
  console.log(`Root nodes: ${roots.length}`);
  for (const r of roots) {
    console.log(`  - [${r.statementType}] ${r.description || r.statementCode} (grade ${JSON.stringify(r.gradeLevel)})`);
  }

  const output = {
    framework,
    nodes: Object.fromEntries(nodesById),
    rootIds: roots.map((r) => r.caseIdentifierUUID),
  };

  fs.writeFileSync("all_data_hierarchy.json", JSON.stringify(output, null, 2));
  console.log(`\nDONE. Saved full hierarchy (${nodesById.size} nodes, ${roots.length} roots) to all_data_hierarchy.json`);
})();
